import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import * as jwksClient from 'jwks-rsa';
import { JWTPayload } from '@music-rec/shared';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  private jwksClient: jwksClient.JwksClient | null = null;

  constructor(private configService: ConfigService) {
    const jwksUri = this.configService.get<string>('JWKS_URI');
    if (jwksUri) {
      this.jwksClient = jwksClient({
        jwksUri,
        cache: true,
        cacheMaxAge: 600000, // 10 minutes
        rateLimit: true,
        jwksRequestsPerMinute: 10,
      });
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Development mode: Allow DEV_USER_ID bypass
    const devUserId = this.configService.get<string>('DEV_USER_ID');
    const nodeEnv = this.configService.get<string>('NODE_ENV');

    if (nodeEnv === 'development' && devUserId) {
      this.logger.debug(`Development mode: Using DEV_USER_ID=${devUserId}`);
      request.user = { externalUserId: devUserId };
      return true;
    }

    // Try Method A: JWT Bearer token
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const externalUserId = await this.verifyJWT(token);
      if (externalUserId) {
        request.user = { externalUserId };
        return true;
      }
    }

    // Try Method B: Internal Gateway Header (X-TheCopy-UserId)
    const internalUserId = request.headers['x-thecopy-userid'];
    if (internalUserId && typeof internalUserId === 'string') {
      // Additional security: Check if request comes from trusted internal network
      // In production, you should verify the request origin (e.g., via IP whitelist or reverse proxy header)
      const trustedProxy = this.configService.get<string>('TRUSTED_PROXY_HEADER');
      if (trustedProxy && request.headers[trustedProxy.toLowerCase()]) {
        this.logger.debug(`Internal gateway auth: userId=${internalUserId}`);
        request.user = { externalUserId: internalUserId };
        return true;
      }
    }

    throw new UnauthorizedException('Authentication required');
  }

  private async verifyJWT(token: string): Promise<string | null> {
    try {
      const issuer = this.configService.get<string>('JWT_ISSUER');
      const audience = this.configService.get<string>('JWT_AUDIENCE');

      // Decode token to get header and payload
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded) {
        this.logger.warn('Failed to decode JWT');
        return null;
      }

      let publicKey: string;

      // If JWKS is configured, fetch the public key
      if (this.jwksClient) {
        const kid = decoded.header.kid;
        if (!kid) {
          this.logger.warn('JWT missing kid in header');
          return null;
        }

        const key = await this.jwksClient.getSigningKey(kid);
        publicKey = key.getPublicKey();
      } else {
        // Fallback to JWT_SECRET for development
        const jwtSecret = this.configService.get<string>('JWT_SECRET');
        if (!jwtSecret) {
          this.logger.warn('No JWKS_URI or JWT_SECRET configured');
          return null;
        }
        publicKey = jwtSecret;
      }

      // Verify the token
      const payload = jwt.verify(token, publicKey, {
        issuer,
        audience,
        algorithms: ['RS256', 'HS256'],
      }) as JWTPayload;

      // Extract external_user_id from sub claim
      if (payload.sub) {
        this.logger.debug(`JWT verified for user: ${payload.sub}`);
        return payload.sub;
      }

      this.logger.warn('JWT missing sub claim');
      return null;
    } catch (error) {
      this.logger.error(`JWT verification failed: ${error.message}`);
      return null;
    }
  }
}
