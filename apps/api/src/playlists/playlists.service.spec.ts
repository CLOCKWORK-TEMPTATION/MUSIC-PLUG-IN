import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PlaylistsService } from './playlists.service';
import { DatabaseService } from '../config/database.service';

describe('PlaylistsService', () => {
  let service: PlaylistsService;

  const mockDatabaseService = {
    query: jest.fn(),
    queryOne: jest.fn(),
    getClient: jest.fn(),
    getPool: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlaylistsService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<PlaylistsService>(PlaylistsService);
  });

  describe('create', () => {
    const externalUserId = 'user-123';
    const playlistId = 'playlist-uuid-1';

    it('should create a new playlist successfully', async () => {
      const mockRow = {
        id: playlistId,
        external_user_id: externalUserId,
        name: 'My Playlist',
        created_at: new Date('2024-01-15T10:00:00Z'),
      };
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockRow);

      const result = await service.create(externalUserId, { name: 'My Playlist' });

      expect(result).toEqual({
        id: playlistId,
        externalUserId,
        name: 'My Playlist',
        createdAt: new Date('2024-01-15T10:00:00Z'),
        tracks: [],
      });
    });

    it('should call database with correct INSERT query', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        id: playlistId,
        external_user_id: externalUserId,
        name: 'Test Playlist',
        created_at: new Date(),
      });

      await service.create(externalUserId, { name: 'Test Playlist' });

      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO playlists'),
        [externalUserId, 'Test Playlist'],
      );
    });

    it('should use RETURNING * in INSERT query', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        id: playlistId,
        external_user_id: externalUserId,
        name: 'Test',
        created_at: new Date(),
      });

      await service.create(externalUserId, { name: 'Test' });

      const query = mockDatabaseService.queryOne.mock.calls[0][0];
      expect(query).toContain('RETURNING *');
    });

    it('should handle special characters in playlist name', async () => {
      const specialName = "Playlist's \"Best\" & Greatest <Hits>";
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        id: playlistId,
        external_user_id: externalUserId,
        name: specialName,
        created_at: new Date(),
      });

      const result = await service.create(externalUserId, { name: specialName });

      expect(result.name).toBe(specialName);
    });

    it('should handle unicode characters in playlist name', async () => {
      const unicodeName = '🎵 日本語プレイリスト 🎶';
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        id: playlistId,
        external_user_id: externalUserId,
        name: unicodeName,
        created_at: new Date(),
      });

      const result = await service.create(externalUserId, { name: unicodeName });

      expect(result.name).toBe(unicodeName);
    });

    it('should propagate database errors', async () => {
      mockDatabaseService.queryOne.mockRejectedValueOnce(
        new Error('Duplicate key violation'),
      );

      await expect(
        service.create(externalUserId, { name: 'Test' }),
      ).rejects.toThrow('Duplicate key violation');
    });
  });

  describe('findAll', () => {
    const externalUserId = 'user-123';

    it('should return all playlists for a user', async () => {
      const mockRows = [
        {
          id: 'playlist-1',
          external_user_id: externalUserId,
          name: 'Playlist 1',
          created_at: new Date('2024-01-15T10:00:00Z'),
        },
        {
          id: 'playlist-2',
          external_user_id: externalUserId,
          name: 'Playlist 2',
          created_at: new Date('2024-01-14T10:00:00Z'),
        },
      ];
      mockDatabaseService.query.mockResolvedValueOnce(mockRows);

      const result = await service.findAll(externalUserId);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'playlist-1',
        externalUserId,
        name: 'Playlist 1',
        createdAt: new Date('2024-01-15T10:00:00Z'),
        tracks: [],
      });
    });

    it('should return empty array when user has no playlists', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.findAll(externalUserId);

      expect(result).toEqual([]);
    });

    it('should order by created_at DESC', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.findAll(externalUserId);

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).toContain('ORDER BY created_at DESC');
    });

    it('should filter by external_user_id', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.findAll(externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE external_user_id = $1'),
        [externalUserId],
      );
    });

    it('should propagate database errors', async () => {
      mockDatabaseService.query.mockRejectedValueOnce(new Error('Connection lost'));

      await expect(service.findAll(externalUserId)).rejects.toThrow('Connection lost');
    });
  });

  describe('findOne', () => {
    const externalUserId = 'user-123';
    const playlistId = 'playlist-uuid-1';

    it('should return playlist with tracks when found', async () => {
      const mockPlaylistRow = {
        id: playlistId,
        external_user_id: externalUserId,
        name: 'My Playlist',
        created_at: new Date('2024-01-15T10:00:00Z'),
      };
      const mockTrackRows = [
        {
          id: 'track-1',
          title: 'Song 1',
          artist: 'Artist 1',
          album: 'Album 1',
          genre: 'rock',
          duration_sec: 180,
          external_url: 'https://example.com/track1',
          preview_url: 'https://example.com/preview1',
          audio_features: { energy: 0.8 },
          embedding: [0.1, 0.2],
          created_at: new Date('2024-01-01'),
        },
      ];

      mockDatabaseService.queryOne.mockResolvedValueOnce(mockPlaylistRow);
      mockDatabaseService.query.mockResolvedValueOnce(mockTrackRows);

      const result = await service.findOne(playlistId, externalUserId);

      expect(result.id).toBe(playlistId);
      expect(result.name).toBe('My Playlist');
      expect(result.tracks).toHaveLength(1);
      expect(result.tracks![0]).toEqual({
        id: 'track-1',
        title: 'Song 1',
        artist: 'Artist 1',
        album: 'Album 1',
        genre: 'rock',
        durationSec: 180,
        externalUrl: 'https://example.com/track1',
        previewUrl: 'https://example.com/preview1',
        audioFeatures: { energy: 0.8 },
        embedding: [0.1, 0.2],
        createdAt: new Date('2024-01-01'),
      });
    });

    it('should throw NotFoundException when playlist not found', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);

      await expect(service.findOne(playlistId, externalUserId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findOne(playlistId, externalUserId)).rejects.toThrow(
        'Playlist not found',
      );
    });

    it('should enforce ownership check in query', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        id: playlistId,
        external_user_id: externalUserId,
        name: 'Test',
        created_at: new Date(),
      });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.findOne(playlistId, externalUserId);

      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('p.external_user_id = $2'),
        [playlistId, externalUserId],
      );
    });

    it('should return empty tracks array when playlist has no tracks', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        id: playlistId,
        external_user_id: externalUserId,
        name: 'Empty Playlist',
        created_at: new Date(),
      });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.findOne(playlistId, externalUserId);

      expect(result.tracks).toEqual([]);
    });

    it('should order tracks by added_at DESC', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        id: playlistId,
        external_user_id: externalUserId,
        name: 'Test',
        created_at: new Date(),
      });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.findOne(playlistId, externalUserId);

      const tracksQuery = mockDatabaseService.query.mock.calls[0][0];
      expect(tracksQuery).toContain('ORDER BY pt.added_at DESC');
    });

    it('should join playlist_tracks and tracks tables', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        id: playlistId,
        external_user_id: externalUserId,
        name: 'Test',
        created_at: new Date(),
      });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.findOne(playlistId, externalUserId);

      const tracksQuery = mockDatabaseService.query.mock.calls[0][0];
      expect(tracksQuery).toContain('JOIN playlist_tracks pt ON pt.track_id = t.id');
    });

    it('should not query tracks if playlist not found', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);

      await expect(service.findOne(playlistId, externalUserId)).rejects.toThrow();

      expect(mockDatabaseService.query).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const externalUserId = 'user-123';
    const playlistId = 'playlist-uuid-1';

    it('should update playlist name successfully', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        id: playlistId,
        external_user_id: externalUserId,
        name: 'Updated Name',
        created_at: new Date('2024-01-15T10:00:00Z'),
      });

      const result = await service.update(playlistId, externalUserId, {
        name: 'Updated Name',
      });

      expect(result.name).toBe('Updated Name');
    });

    it('should throw NotFoundException when playlist not found', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);

      await expect(
        service.update(playlistId, externalUserId, { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when playlist belongs to different user', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);

      await expect(
        service.update(playlistId, 'different-user', { name: 'New Name' }),
      ).rejects.toThrow('Playlist not found');
    });

    it('should enforce ownership check in UPDATE query', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        id: playlistId,
        external_user_id: externalUserId,
        name: 'Test',
        created_at: new Date(),
      });

      await service.update(playlistId, externalUserId, { name: 'Test' });

      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $2 AND external_user_id = $3'),
        ['Test', playlistId, externalUserId],
      );
    });

    it('should use RETURNING * in UPDATE query', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        id: playlistId,
        external_user_id: externalUserId,
        name: 'Test',
        created_at: new Date(),
      });

      await service.update(playlistId, externalUserId, { name: 'Test' });

      const query = mockDatabaseService.queryOne.mock.calls[0][0];
      expect(query).toContain('RETURNING *');
    });

    it('should propagate database errors', async () => {
      mockDatabaseService.queryOne.mockRejectedValueOnce(new Error('Update failed'));

      await expect(
        service.update(playlistId, externalUserId, { name: 'Test' }),
      ).rejects.toThrow('Update failed');
    });
  });

  describe('remove', () => {
    const externalUserId = 'user-123';
    const playlistId = 'playlist-uuid-1';

    it('should delete playlist successfully', async () => {
      // DELETE returns affected rows - simulate 1 row deleted
      mockDatabaseService.query.mockResolvedValueOnce([{ id: playlistId }]);

      await expect(service.remove(playlistId, externalUserId)).resolves.not.toThrow();
    });

    it('should throw NotFoundException when playlist not found', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await expect(service.remove(playlistId, externalUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when playlist belongs to different user', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await expect(service.remove(playlistId, 'different-user')).rejects.toThrow(
        'Playlist not found',
      );
    });

    it('should enforce ownership check in DELETE query', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([{ id: playlistId }]);

      await service.remove(playlistId, externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1 AND external_user_id = $2'),
        [playlistId, externalUserId],
      );
    });

    it('should propagate database errors', async () => {
      mockDatabaseService.query.mockRejectedValueOnce(
        new Error('Foreign key constraint'),
      );

      await expect(service.remove(playlistId, externalUserId)).rejects.toThrow(
        'Foreign key constraint',
      );
    });
  });

  describe('addTrack', () => {
    const externalUserId = 'user-123';
    const playlistId = 'playlist-uuid-1';
    const trackId = 'track-uuid-1';

    it('should add track to playlist successfully', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({ id: playlistId });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await expect(
        service.addTrack(playlistId, trackId, externalUserId),
      ).resolves.not.toThrow();
    });

    it('should throw NotFoundException when playlist not found', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);

      await expect(
        service.addTrack(playlistId, trackId, externalUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should verify playlist ownership before adding track', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({ id: playlistId });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.addTrack(playlistId, trackId, externalUserId);

      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        'SELECT id FROM playlists WHERE id = $1 AND external_user_id = $2',
        [playlistId, externalUserId],
      );
    });

    it('should use ON CONFLICT DO NOTHING for idempotent adds', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({ id: playlistId });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.addTrack(playlistId, trackId, externalUserId);

      const insertQuery = mockDatabaseService.query.mock.calls[0][0];
      expect(insertQuery).toContain('ON CONFLICT (playlist_id, track_id) DO NOTHING');
    });

    it('should insert into playlist_tracks with correct values', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({ id: playlistId });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.addTrack(playlistId, trackId, externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO playlist_tracks'),
        [playlistId, trackId],
      );
    });

    it('should not insert track if ownership check fails', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);

      await expect(
        service.addTrack(playlistId, trackId, externalUserId),
      ).rejects.toThrow();

      expect(mockDatabaseService.query).not.toHaveBeenCalled();
    });

    it('should propagate database errors', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({ id: playlistId });
      mockDatabaseService.query.mockRejectedValueOnce(
        new Error('Track does not exist'),
      );

      await expect(
        service.addTrack(playlistId, trackId, externalUserId),
      ).rejects.toThrow('Track does not exist');
    });

    it('should be idempotent - adding same track twice succeeds', async () => {
      mockDatabaseService.queryOne.mockResolvedValue({ id: playlistId });
      mockDatabaseService.query.mockResolvedValue([]);

      await service.addTrack(playlistId, trackId, externalUserId);
      await service.addTrack(playlistId, trackId, externalUserId);

      // Both calls should succeed without error
      expect(mockDatabaseService.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('removeTrack', () => {
    const externalUserId = 'user-123';
    const playlistId = 'playlist-uuid-1';
    const trackId = 'track-uuid-1';

    it('should remove track from playlist successfully', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({ id: playlistId });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await expect(
        service.removeTrack(playlistId, trackId, externalUserId),
      ).resolves.not.toThrow();
    });

    it('should throw NotFoundException when playlist not found', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);

      await expect(
        service.removeTrack(playlistId, trackId, externalUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should verify playlist ownership before removing track', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({ id: playlistId });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.removeTrack(playlistId, trackId, externalUserId);

      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        'SELECT id FROM playlists WHERE id = $1 AND external_user_id = $2',
        [playlistId, externalUserId],
      );
    });

    it('should delete from playlist_tracks with correct values', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({ id: playlistId });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.removeTrack(playlistId, trackId, externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        'DELETE FROM playlist_tracks WHERE playlist_id = $1 AND track_id = $2',
        [playlistId, trackId],
      );
    });

    it('should not delete track if ownership check fails', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);

      await expect(
        service.removeTrack(playlistId, trackId, externalUserId),
      ).rejects.toThrow();

      expect(mockDatabaseService.query).not.toHaveBeenCalled();
    });

    it('should succeed even if track was not in playlist', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({ id: playlistId });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      // Removing non-existent track should not throw
      await expect(
        service.removeTrack(playlistId, 'non-existent-track', externalUserId),
      ).resolves.not.toThrow();
    });

    it('should propagate database errors', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({ id: playlistId });
      mockDatabaseService.query.mockRejectedValueOnce(new Error('Connection lost'));

      await expect(
        service.removeTrack(playlistId, trackId, externalUserId),
      ).rejects.toThrow('Connection lost');
    });
  });

  describe('mapRowToPlaylist (private method via public interface)', () => {
    it('should correctly map database row to Playlist object', async () => {
      const mockRow = {
        id: 'playlist-123',
        external_user_id: 'user-456',
        name: 'Test Playlist',
        created_at: new Date('2024-06-15T12:30:00Z'),
      };
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockRow);

      const result = await service.create('user-456', { name: 'Test Playlist' });

      expect(result).toEqual({
        id: 'playlist-123',
        externalUserId: 'user-456',
        name: 'Test Playlist',
        createdAt: new Date('2024-06-15T12:30:00Z'),
        tracks: [],
      });
    });

    it('should always initialize tracks as empty array', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        id: 'playlist-1',
        external_user_id: 'user-1',
        name: 'Test',
        created_at: new Date(),
      });

      const result = await service.create('user-1', { name: 'Test' });

      expect(result.tracks).toEqual([]);
      expect(Array.isArray(result.tracks)).toBe(true);
    });
  });

  describe('SQL injection prevention', () => {
    const maliciousPlaylistId = "'; DROP TABLE playlists; --";
    const maliciousUserId = "'; DELETE FROM users; --";
    const maliciousName = "Test'; DROP TABLE tracks; --";

    it('should safely handle malicious playlist ID in findOne', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);

      await expect(
        service.findOne(maliciousPlaylistId, 'user-123'),
      ).rejects.toThrow(NotFoundException);

      const [query, params] = mockDatabaseService.queryOne.mock.calls[0];
      expect(query).not.toContain(maliciousPlaylistId);
      expect(params).toContain(maliciousPlaylistId);
    });

    it('should safely handle malicious user ID in findAll', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.findAll(maliciousUserId);

      const [query, params] = mockDatabaseService.query.mock.calls[0];
      expect(query).not.toContain(maliciousUserId);
      expect(params).toContain(maliciousUserId);
    });

    it('should safely handle malicious playlist name in create', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        id: 'playlist-1',
        external_user_id: 'user-123',
        name: maliciousName,
        created_at: new Date(),
      });

      await service.create('user-123', { name: maliciousName });

      const [query, params] = mockDatabaseService.queryOne.mock.calls[0];
      expect(query).not.toContain(maliciousName);
      expect(params).toContain(maliciousName);
    });

    it('should safely handle malicious IDs in addTrack', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({ id: 'playlist-1' });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.addTrack(maliciousPlaylistId, maliciousUserId, 'user-123');

      // All IDs should be in params, not interpolated in query
      expect(mockDatabaseService.queryOne.mock.calls[0][1]).toContain(
        maliciousPlaylistId,
      );
    });
  });

  describe('edge cases', () => {
    it('should handle very long playlist names', async () => {
      const longName = 'a'.repeat(1000);
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        id: 'playlist-1',
        external_user_id: 'user-123',
        name: longName,
        created_at: new Date(),
      });

      const result = await service.create('user-123', { name: longName });

      expect(result.name).toBe(longName);
    });

    it('should handle playlist with many tracks', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        id: 'playlist-1',
        external_user_id: 'user-123',
        name: 'Big Playlist',
        created_at: new Date(),
      });

      const manyTracks = Array.from({ length: 500 }, (_, i) => ({
        id: `track-${i}`,
        title: `Song ${i}`,
        artist: `Artist ${i}`,
        album: `Album ${i}`,
        genre: 'rock',
        duration_sec: 180,
        external_url: `https://example.com/track${i}`,
        preview_url: null,
        audio_features: null,
        embedding: null,
        created_at: new Date(),
      }));
      mockDatabaseService.query.mockResolvedValueOnce(manyTracks);

      const result = await service.findOne('playlist-1', 'user-123');

      expect(result.tracks).toHaveLength(500);
    });

    it('should handle concurrent operations on same playlist', async () => {
      mockDatabaseService.queryOne.mockResolvedValue({ id: 'playlist-1' });
      mockDatabaseService.query.mockResolvedValue([]);

      await Promise.all([
        service.addTrack('playlist-1', 'track-1', 'user-123'),
        service.addTrack('playlist-1', 'track-2', 'user-123'),
        service.addTrack('playlist-1', 'track-3', 'user-123'),
      ]);

      // All operations should complete
      expect(mockDatabaseService.query).toHaveBeenCalledTimes(3);
    });
  });
});
