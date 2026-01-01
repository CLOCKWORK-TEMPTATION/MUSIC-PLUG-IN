import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { DatabaseService } from '../config/database.service';
import { Playlist, PlaylistCreateInput, PlaylistUpdateInput } from '@music-rec/shared';

@Injectable()
export class PlaylistsService {
  private readonly logger = new Logger(PlaylistsService.name);

  constructor(private db: DatabaseService) {}

  async create(externalUserId: string, data: PlaylistCreateInput): Promise<Playlist> {
    const row = await this.db.queryOne<any>(
      `INSERT INTO playlists (external_user_id, name)
       VALUES ($1, $2)
       RETURNING *`,
      [externalUserId, data.name],
    );

    return this.mapRowToPlaylist(row);
  }

  async findAll(externalUserId: string): Promise<Playlist[]> {
    const rows = await this.db.query<any>(
      `SELECT * FROM playlists
       WHERE external_user_id = $1
       ORDER BY created_at DESC`,
      [externalUserId],
    );

    return rows.map(this.mapRowToPlaylist);
  }

  async findOne(id: string, externalUserId: string): Promise<Playlist> {
    const row = await this.db.queryOne<any>(
      `SELECT p.*
       FROM playlists p
       WHERE p.id = $1 AND p.external_user_id = $2`,
      [id, externalUserId],
    );

    if (!row) {
      throw new NotFoundException('Playlist not found');
    }

    // Get tracks in playlist
    const tracks = await this.db.query<any>(
      `SELECT t.*
       FROM tracks t
       JOIN playlist_tracks pt ON pt.track_id = t.id
       WHERE pt.playlist_id = $1
       ORDER BY pt.added_at DESC`,
      [id],
    );

    const playlist = this.mapRowToPlaylist(row);
    playlist.tracks = tracks.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      album: t.album,
      genre: t.genre,
      durationSec: t.duration_sec,
      externalUrl: t.external_url,
      previewUrl: t.preview_url,
      audioFeatures: t.audio_features,
      embedding: t.embedding,
      createdAt: t.created_at,
    }));

    return playlist;
  }

  async update(
    id: string,
    externalUserId: string,
    data: PlaylistUpdateInput,
  ): Promise<Playlist> {
    const row = await this.db.queryOne<any>(
      `UPDATE playlists
       SET name = $1
       WHERE id = $2 AND external_user_id = $3
       RETURNING *`,
      [data.name, id, externalUserId],
    );

    if (!row) {
      throw new NotFoundException('Playlist not found');
    }

    return this.mapRowToPlaylist(row);
  }

  async remove(id: string, externalUserId: string): Promise<void> {
    const result = await this.db.query(
      `DELETE FROM playlists
       WHERE id = $1 AND external_user_id = $2`,
      [id, externalUserId],
    );

    if (result.length === 0) {
      throw new NotFoundException('Playlist not found');
    }
  }

  async addTrack(playlistId: string, trackId: string, externalUserId: string): Promise<void> {
    // Verify playlist belongs to user
    const playlist = await this.db.queryOne<any>(
      'SELECT id FROM playlists WHERE id = $1 AND external_user_id = $2',
      [playlistId, externalUserId],
    );

    if (!playlist) {
      throw new NotFoundException('Playlist not found');
    }

    // Add track (ignore if already exists)
    await this.db.query(
      `INSERT INTO playlist_tracks (playlist_id, track_id, added_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (playlist_id, track_id) DO NOTHING`,
      [playlistId, trackId],
    );

    this.logger.log(`Added track ${trackId} to playlist ${playlistId}`);
  }

  async removeTrack(
    playlistId: string,
    trackId: string,
    externalUserId: string,
  ): Promise<void> {
    // Verify playlist belongs to user
    const playlist = await this.db.queryOne<any>(
      'SELECT id FROM playlists WHERE id = $1 AND external_user_id = $2',
      [playlistId, externalUserId],
    );

    if (!playlist) {
      throw new NotFoundException('Playlist not found');
    }

    await this.db.query(
      'DELETE FROM playlist_tracks WHERE playlist_id = $1 AND track_id = $2',
      [playlistId, trackId],
    );
  }

  private mapRowToPlaylist(row: any): Playlist {
    return {
      id: row.id,
      externalUserId: row.external_user_id,
      name: row.name,
      createdAt: row.created_at,
      tracks: [],
    };
  }
}
