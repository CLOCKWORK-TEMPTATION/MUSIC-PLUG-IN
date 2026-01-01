import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PlaylistsService } from './playlists.service';
import { AuthGuard } from '../common/guards/auth.guard';
import { CurrentUser, AuthenticatedUser } from '../common/decorators/user.decorator';
import {
  PlaylistCreateSchema,
  PlaylistUpdateSchema,
  PlaylistAddTrackSchema,
} from '@music-rec/shared';

@ApiTags('playlists')
@Controller('playlists')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class PlaylistsController {
  constructor(private playlistsService: PlaylistsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all playlists for the current user' })
  async findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.playlistsService.findAll(user.externalUserId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific playlist with tracks' })
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.playlistsService.findOne(id, user.externalUserId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new playlist' })
  async create(@CurrentUser() user: AuthenticatedUser, @Body() body: any) {
    const validated = PlaylistCreateSchema.parse(body);
    return this.playlistsService.create(user.externalUserId, validated);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a playlist' })
  async update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: any,
  ) {
    const validated = PlaylistUpdateSchema.parse(body);
    return this.playlistsService.update(id, user.externalUserId, validated);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a playlist' })
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.playlistsService.remove(id, user.externalUserId);
    return { success: true };
  }

  @Post(':id/tracks')
  @ApiOperation({ summary: 'Add a track to a playlist' })
  async addTrack(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: any,
  ) {
    const validated = PlaylistAddTrackSchema.parse(body);
    await this.playlistsService.addTrack(id, validated.trackId, user.externalUserId);
    return { success: true };
  }

  @Delete(':id/tracks/:trackId')
  @ApiOperation({ summary: 'Remove a track from a playlist' })
  async removeTrack(
    @Param('id') id: string,
    @Param('trackId') trackId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.playlistsService.removeTrack(id, trackId, user.externalUserId);
    return { success: true };
  }
}
