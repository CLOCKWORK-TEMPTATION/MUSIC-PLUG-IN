import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/user.decorator';
import { OnboardingPreferencesSchema, OnboardingPreferencesInput } from '@music-rec/shared';

@ApiTags('users')
@Controller('me')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    const profile = await this.usersService.findOrCreateProfile(user.externalUserId);
    return profile;
  }

  @Put('preferences')
  @ApiOperation({ summary: 'Update user preferences (onboarding)' })
  async updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: OnboardingPreferencesInput,
  ) {
    // Validate with Zod
    const validated = OnboardingPreferencesSchema.parse(body);

    const profile = await this.usersService.updatePreferences(
      user.externalUserId,
      validated.preferredGenres,
    );

    return profile;
  }
}
