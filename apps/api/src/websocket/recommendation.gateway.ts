import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { RecommendationsService } from '../recommendations/recommendations.service';
import { RecommendationUpdateEvent } from '@music-rec/shared';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/recommendations',
})
export class RecommendationGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RecommendationGateway.name);
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set<socketId>

  constructor(private recommendationsService: RecommendationsService) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;

    if (!userId) {
      this.logger.warn(`Client ${client.id} connected without userId`);
      client.disconnect();
      return;
    }

    this.logger.log(`Client connected: ${client.id} for user ${userId}`);

    // Track user socket
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(client.id);

    // Store userId in socket data
    client.data.userId = userId;

    // Join user-specific room
    client.join(`user:${userId}`);
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;

    if (userId) {
      const sockets = this.userSockets.get(userId);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
        }
      }
    }

    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('ping')
  handlePing(client: Socket) {
    return { event: 'pong', data: { timestamp: Date.now() } };
  }

  async triggerRecommendationRefresh(
    userId: string,
    reason: 'skip_detected' | 'context_change' | 'manual_refresh',
  ) {
    try {
      // Invalidate cache
      await this.recommendationsService.invalidateCache(userId);

      // Get fresh recommendations
      const recommendations = await this.recommendationsService.getRecommendations(userId, {
        limit: 20,
      });

      const updateEvent: RecommendationUpdateEvent = {
        tracks: recommendations.tracks,
        reason,
      };

      // Emit to all sockets for this user
      this.server.to(`user:${userId}`).emit('recommendations:update', updateEvent);

      this.logger.log(
        `Sent recommendation refresh to user ${userId}, reason: ${reason}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to trigger recommendation refresh for user ${userId}`,
        error,
      );
    }
  }

  @SubscribeMessage('request-refresh')
  async handleManualRefresh(client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      await this.triggerRecommendationRefresh(userId, 'manual_refresh');
    }
  }
}
