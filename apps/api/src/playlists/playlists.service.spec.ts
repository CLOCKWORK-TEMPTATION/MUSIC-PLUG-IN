import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PlaylistsService } from './playlists.service';
import { DatabaseService } from '../config/database.service';

describe('PlaylistsService', () => {
  let service: PlaylistsService;

  // Mock database service
  const mockDatabaseService = {
    query: jest.fn(),
    queryOne: jest.fn(),
    getClient: jest.fn(),
    getPool: jest.fn(),
  };

  beforeEach(async () => {
    // Reset all mocks completely before each test
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
    const playlistId = '550e8400-e29b-41d4-a716-446655440000';

    const createMockDbRow = (overrides = {}) => ({
      id: playlistId,
      external_user_id: externalUserId,
      name: 'My Playlist',
      created_at: new Date('2024-01-15T10:00:00Z'),
      ...overrides,
    });

    it('should create a new playlist successfully', async () => {
      const mockRow = createMockDbRow();
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockRow);

      const result = await service.create(externalUserId, { name: 'My Playlist' });

      expect(result).toEqual({
        id: playlistId,
        externalUserId,
        name: 'My Playlist',
        createdAt: new Date('2024-01-15T10:00:00Z'),
        tracks: [],
      });

      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO playlists'),
        [externalUserId, 'My Playlist'],
      );
    });

    it('should create playlist with different name', async () => {
      const mockRow = createMockDbRow({ name: 'Rock Classics' });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockRow);

      const result = await service.create(externalUserId, { name: 'Rock Classics' });

      expect(result.name).toBe('Rock Classics');
    });

    it('should handle unicode characters in playlist name', async () => {
      const mockRow = createMockDbRow({ name: '私のプレイリスト' });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockRow);

      const result = await service.create(externalUserId, { name: '私のプレイリスト' });

      expect(result.name).toBe('私のプレイリスト');
    });

    it('should handle special characters in playlist name', async () => {
      const mockRow = createMockDbRow({ name: "Rock 'n' Roll & Blues!" });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockRow);

      const result = await service.create(externalUserId, { name: "Rock 'n' Roll & Blues!" });

      expect(result.name).toBe("Rock 'n' Roll & Blues!");
    });

    it('should use RETURNING * to get the created row', async () => {
      const mockRow = createMockDbRow();
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockRow);

      await service.create(externalUserId, { name: 'Test' });

      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('RETURNING *'),
        expect.any(Array),
      );
    });

    it('should initialize tracks as empty array', async () => {
      const mockRow = createMockDbRow();
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockRow);

      const result = await service.create(externalUserId, { name: 'Test' });

      expect(result.tracks).toEqual([]);
    });
  });

  describe('findAll', () => {
    const externalUserId = 'user-123';

    const createMockRows = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: `playlist-${i + 1}`,
        external_user_id: externalUserId,
        name: `Playlist ${i + 1}`,
        created_at: new Date(2024, 0, 15, 10, count - i),
      }));

    it('should return all playlists for a user', async () => {
      const mockRows = createMockRows(3);
      mockDatabaseService.query.mockResolvedValueOnce(mockRows);

      const result = await service.findAll(externalUserId);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        id: 'playlist-1',
        externalUserId,
        name: 'Playlist 1',
        createdAt: expect.any(Date),
        tracks: [],
      });
    });

    it('should return empty array when user has no playlists', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.findAll(externalUserId);

      expect(result).toEqual([]);
    });

    it('should order playlists by created_at DESC', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.findAll(externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        expect.any(Array),
      );
    });

    it('should filter by external_user_id', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.findAll('specific-user');

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE external_user_id = $1'),
        ['specific-user'],
      );
    });

    it('should map all rows to Playlist objects', async () => {
      const mockRows = createMockRows(5);
      mockDatabaseService.query.mockResolvedValueOnce(mockRows);

      const result = await service.findAll(externalUserId);

      expect(result).toHaveLength(5);
      result.forEach((playlist, index) => {
        expect(playlist.id).toBe(`playlist-${index + 1}`);
        expect(playlist.tracks).toEqual([]);
      });
    });
  });

  describe('findOne', () => {
    const externalUserId = 'user-123';
    const playlistId = '550e8400-e29b-41d4-a716-446655440000';

    const createMockPlaylistRow = (overrides = {}) => ({
      id: playlistId,
      external_user_id: externalUserId,
      name: 'My Playlist',
      created_at: new Date('2024-01-15T10:00:00Z'),
      ...overrides,
    });

    const createMockTrackRows = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: `track-${i + 1}`,
        title: `Track ${i + 1}`,
        artist: `Artist ${i + 1}`,
        album: `Album ${i + 1}`,
        genre: 'rock',
        duration_sec: 180 + i * 30,
        external_url: `https://example.com/track/${i + 1}`,
        preview_url: `https://example.com/preview/${i + 1}`,
        audio_features: { tempo: 120 },
        embedding: null,
        created_at: new Date(2024, 0, 15, 10, i),
      }));

    it('should return playlist with tracks', async () => {
      const mockPlaylist = createMockPlaylistRow();
      const mockTracks = createMockTrackRows(2);

      mockDatabaseService.queryOne.mockResolvedValueOnce(mockPlaylist);
      mockDatabaseService.query.mockResolvedValueOnce(mockTracks);

      const result = await service.findOne(playlistId, externalUserId);

      expect(result.id).toBe(playlistId);
      expect(result.name).toBe('My Playlist');
      expect(result.tracks).toHaveLength(2);
      expect(result.tracks![0]).toEqual({
        id: 'track-1',
        title: 'Track 1',
        artist: 'Artist 1',
        album: 'Album 1',
        genre: 'rock',
        durationSec: 180,
        externalUrl: 'https://example.com/track/1',
        previewUrl: 'https://example.com/preview/1',
        audioFeatures: { tempo: 120 },
        embedding: null,
        createdAt: expect.any(Date),
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

    it('should return empty tracks array when playlist has no tracks', async () => {
      const mockPlaylist = createMockPlaylistRow();
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockPlaylist);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.findOne(playlistId, externalUserId);

      expect(result.tracks).toEqual([]);
    });

    it('should verify both playlist id and user id', async () => {
      const mockPlaylist = createMockPlaylistRow();
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockPlaylist);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.findOne(playlistId, externalUserId);

      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('p.id = $1 AND p.external_user_id = $2'),
        [playlistId, externalUserId],
      );
    });

    it('should order tracks by added_at DESC', async () => {
      const mockPlaylist = createMockPlaylistRow();
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockPlaylist);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.findOne(playlistId, externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY pt.added_at DESC'),
        expect.any(Array),
      );
    });

    it('should join playlist_tracks with tracks table', async () => {
      const mockPlaylist = createMockPlaylistRow();
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockPlaylist);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.findOne(playlistId, externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('JOIN playlist_tracks pt ON pt.track_id = t.id'),
        expect.any(Array),
      );
    });

    it('should handle tracks with null optional fields', async () => {
      const mockPlaylist = createMockPlaylistRow();
      const trackWithNulls = {
        id: 'track-1',
        title: 'Track 1',
        artist: 'Artist 1',
        album: null,
        genre: null,
        duration_sec: 180,
        external_url: null,
        preview_url: null,
        audio_features: null,
        embedding: null,
        created_at: new Date(),
      };

      mockDatabaseService.queryOne.mockResolvedValueOnce(mockPlaylist);
      mockDatabaseService.query.mockResolvedValueOnce([trackWithNulls]);

      const result = await service.findOne(playlistId, externalUserId);

      expect(result.tracks![0].album).toBeNull();
      expect(result.tracks![0].genre).toBeNull();
      expect(result.tracks![0].externalUrl).toBeNull();
      expect(result.tracks![0].previewUrl).toBeNull();
      expect(result.tracks![0].audioFeatures).toBeNull();
    });
  });

  describe('update', () => {
    const externalUserId = 'user-123';
    const playlistId = '550e8400-e29b-41d4-a716-446655440000';

    const createMockDbRow = (overrides = {}) => ({
      id: playlistId,
      external_user_id: externalUserId,
      name: 'Updated Playlist',
      created_at: new Date('2024-01-15T10:00:00Z'),
      ...overrides,
    });

    it('should update playlist name successfully', async () => {
      const mockRow = createMockDbRow();
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockRow);

      const result = await service.update(playlistId, externalUserId, {
        name: 'Updated Playlist',
      });

      expect(result.name).toBe('Updated Playlist');
      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE playlists'),
        ['Updated Playlist', playlistId, externalUserId],
      );
    });

    it('should throw NotFoundException when playlist not found', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);

      await expect(
        service.update(playlistId, externalUserId, { name: 'New Name' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should verify ownership via external_user_id', async () => {
      const mockRow = createMockDbRow();
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockRow);

      await service.update(playlistId, externalUserId, { name: 'Test' });

      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('external_user_id = $3'),
        expect.arrayContaining([externalUserId]),
      );
    });

    it('should use RETURNING * to get updated row', async () => {
      const mockRow = createMockDbRow();
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockRow);

      await service.update(playlistId, externalUserId, { name: 'Test' });

      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('RETURNING *'),
        expect.any(Array),
      );
    });

    it('should handle unicode characters in updated name', async () => {
      const mockRow = createMockDbRow({ name: '音楽プレイリスト' });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockRow);

      const result = await service.update(playlistId, externalUserId, {
        name: '音楽プレイリスト',
      });

      expect(result.name).toBe('音楽プレイリスト');
    });

    it('should return playlist with empty tracks array', async () => {
      const mockRow = createMockDbRow();
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockRow);

      const result = await service.update(playlistId, externalUserId, {
        name: 'Test',
      });

      expect(result.tracks).toEqual([]);
    });
  });

  describe('remove', () => {
    const externalUserId = 'user-123';
    const playlistId = '550e8400-e29b-41d4-a716-446655440000';

    it('should delete playlist successfully', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([{ id: playlistId }]);

      await expect(
        service.remove(playlistId, externalUserId),
      ).resolves.toBeUndefined();

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM playlists'),
        [playlistId, externalUserId],
      );
    });

    it('should throw NotFoundException when playlist not found', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await expect(service.remove(playlistId, externalUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should verify ownership via external_user_id', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([{ id: playlistId }]);

      await service.remove(playlistId, externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('external_user_id = $2'),
        [playlistId, externalUserId],
      );
    });

    it('should not throw when deleting own playlist', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([{ id: playlistId }]);

      await expect(
        service.remove(playlistId, externalUserId),
      ).resolves.not.toThrow();
    });
  });

  describe('addTrack', () => {
    const externalUserId = 'user-123';
    const playlistId = '550e8400-e29b-41d4-a716-446655440000';
    const trackId = '660e8400-e29b-41d4-a716-446655440001';

    it('should add track to playlist successfully', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({ id: playlistId });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await expect(
        service.addTrack(playlistId, trackId, externalUserId),
      ).resolves.toBeUndefined();

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO playlist_tracks'),
        [playlistId, trackId],
      );
    });

    it('should verify playlist ownership before adding track', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({ id: playlistId });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.addTrack(playlistId, trackId, externalUserId);

      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('id = $1 AND external_user_id = $2'),
        [playlistId, externalUserId],
      );
    });

    it('should throw NotFoundException when playlist not found', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);

      await expect(
        service.addTrack(playlistId, trackId, externalUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should use ON CONFLICT DO NOTHING for duplicate tracks', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({ id: playlistId });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.addTrack(playlistId, trackId, externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (playlist_id, track_id) DO NOTHING'),
        expect.any(Array),
      );
    });

    it('should set added_at to NOW()', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({ id: playlistId });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.addTrack(playlistId, trackId, externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('NOW()'),
        expect.any(Array),
      );
    });

    it('should not throw when adding same track twice', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({ id: playlistId });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      // The ON CONFLICT DO NOTHING should prevent errors
      await expect(
        service.addTrack(playlistId, trackId, externalUserId),
      ).resolves.not.toThrow();
    });
  });

  describe('removeTrack', () => {
    const externalUserId = 'user-123';
    const playlistId = '550e8400-e29b-41d4-a716-446655440000';
    const trackId = '660e8400-e29b-41d4-a716-446655440001';

    it('should remove track from playlist successfully', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({ id: playlistId });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await expect(
        service.removeTrack(playlistId, trackId, externalUserId),
      ).resolves.toBeUndefined();

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM playlist_tracks'),
        [playlistId, trackId],
      );
    });

    it('should verify playlist ownership before removing track', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({ id: playlistId });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.removeTrack(playlistId, trackId, externalUserId);

      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('id = $1 AND external_user_id = $2'),
        [playlistId, externalUserId],
      );
    });

    it('should throw NotFoundException when playlist not found', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);

      await expect(
        service.removeTrack(playlistId, trackId, externalUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should filter by both playlist_id and track_id', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({ id: playlistId });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.removeTrack(playlistId, trackId, externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('playlist_id = $1 AND track_id = $2'),
        [playlistId, trackId],
      );
    });

    it('should not throw when removing non-existent track', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({ id: playlistId });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      // DELETE on non-existent row doesn't throw
      await expect(
        service.removeTrack(playlistId, trackId, externalUserId),
      ).resolves.not.toThrow();
    });
  });

  describe('mapRowToPlaylist (private method)', () => {
    const externalUserId = 'user-123';

    it('should correctly map all fields from database row', async () => {
      const mockRow = {
        id: 'playlist-1',
        external_user_id: externalUserId,
        name: 'Test Playlist',
        created_at: new Date('2024-06-15T14:30:00Z'),
      };
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockRow);

      const result = await service.create(externalUserId, { name: 'Test Playlist' });

      expect(result.id).toBe('playlist-1');
      expect(result.externalUserId).toBe(externalUserId);
      expect(result.name).toBe('Test Playlist');
      expect(result.createdAt).toEqual(new Date('2024-06-15T14:30:00Z'));
      expect(result.tracks).toEqual([]);
    });

    it('should handle different date formats', async () => {
      const mockRow = {
        id: 'playlist-1',
        external_user_id: externalUserId,
        name: 'Test',
        created_at: '2024-06-15T14:30:00.000Z',
      };
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockRow);

      const result = await service.create(externalUserId, { name: 'Test' });

      expect(result.createdAt).toBe('2024-06-15T14:30:00.000Z');
    });
  });

  describe('edge cases and error handling', () => {
    const externalUserId = 'user-123';
    const playlistId = '550e8400-e29b-41d4-a716-446655440000';

    it('should propagate database errors from create', async () => {
      const dbError = new Error('Database connection failed');
      mockDatabaseService.queryOne.mockRejectedValueOnce(dbError);

      await expect(
        service.create(externalUserId, { name: 'Test' }),
      ).rejects.toThrow('Database connection failed');
    });

    it('should propagate database errors from findAll', async () => {
      const dbError = new Error('Query timeout');
      mockDatabaseService.query.mockRejectedValueOnce(dbError);

      await expect(service.findAll(externalUserId)).rejects.toThrow(
        'Query timeout',
      );
    });

    it('should propagate database errors from findOne', async () => {
      const dbError = new Error('Connection pool exhausted');
      mockDatabaseService.queryOne.mockRejectedValueOnce(dbError);

      await expect(
        service.findOne(playlistId, externalUserId),
      ).rejects.toThrow('Connection pool exhausted');
    });

    it('should propagate database errors from update', async () => {
      const dbError = new Error('SQL syntax error');
      mockDatabaseService.queryOne.mockRejectedValueOnce(dbError);

      await expect(
        service.update(playlistId, externalUserId, { name: 'Test' }),
      ).rejects.toThrow('SQL syntax error');
    });

    it('should propagate database errors from remove', async () => {
      const dbError = new Error('Foreign key violation');
      mockDatabaseService.query.mockRejectedValueOnce(dbError);

      await expect(
        service.remove(playlistId, externalUserId),
      ).rejects.toThrow('Foreign key violation');
    });

    it('should propagate database errors from addTrack', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({ id: playlistId });
      const dbError = new Error('Constraint violation');
      mockDatabaseService.query.mockRejectedValueOnce(dbError);

      await expect(
        service.addTrack(playlistId, 'track-1', externalUserId),
      ).rejects.toThrow('Constraint violation');
    });

    it('should propagate database errors from removeTrack', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({ id: playlistId });
      const dbError = new Error('Deadlock detected');
      mockDatabaseService.query.mockRejectedValueOnce(dbError);

      await expect(
        service.removeTrack(playlistId, 'track-1', externalUserId),
      ).rejects.toThrow('Deadlock detected');
    });

    it('should handle very long playlist names', async () => {
      const longName = 'A'.repeat(500);
      const mockRow = {
        id: playlistId,
        external_user_id: externalUserId,
        name: longName,
        created_at: new Date(),
      };
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockRow);

      const result = await service.create(externalUserId, { name: longName });

      expect(result.name).toBe(longName);
    });

    it('should handle special characters in user ID', async () => {
      const specialUserId = "user-with'quotes\"and\\backslashes";
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.findAll(specialUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.any(String),
        [specialUserId],
      );
    });

    it('should handle empty playlist name', async () => {
      const mockRow = {
        id: playlistId,
        external_user_id: externalUserId,
        name: '',
        created_at: new Date(),
      };
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockRow);

      const result = await service.create(externalUserId, { name: '' });

      expect(result.name).toBe('');
    });
  });

  describe('concurrent operations', () => {
    const externalUserId = 'user-123';

    it('should handle multiple concurrent create calls', async () => {
      const mockRows = [
        { id: 'playlist-1', external_user_id: externalUserId, name: 'Playlist 1', created_at: new Date() },
        { id: 'playlist-2', external_user_id: externalUserId, name: 'Playlist 2', created_at: new Date() },
        { id: 'playlist-3', external_user_id: externalUserId, name: 'Playlist 3', created_at: new Date() },
      ];

      mockRows.forEach((row) => {
        mockDatabaseService.queryOne.mockResolvedValueOnce(row);
      });

      const results = await Promise.all([
        service.create(externalUserId, { name: 'Playlist 1' }),
        service.create(externalUserId, { name: 'Playlist 2' }),
        service.create(externalUserId, { name: 'Playlist 3' }),
      ]);

      expect(results).toHaveLength(3);
      expect(results[0].name).toBe('Playlist 1');
      expect(results[1].name).toBe('Playlist 2');
      expect(results[2].name).toBe('Playlist 3');
    });

    it('should handle concurrent addTrack calls to same playlist', async () => {
      const playlistId = 'playlist-1';
      const trackIds = ['track-1', 'track-2', 'track-3'];

      trackIds.forEach(() => {
        mockDatabaseService.queryOne.mockResolvedValueOnce({ id: playlistId });
        mockDatabaseService.query.mockResolvedValueOnce([]);
      });

      await Promise.all(
        trackIds.map((trackId) =>
          service.addTrack(playlistId, trackId, externalUserId),
        ),
      );

      expect(mockDatabaseService.queryOne).toHaveBeenCalledTimes(3);
      expect(mockDatabaseService.query).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed concurrent operations', async () => {
      const playlistId = 'playlist-1';

      // Setup mocks for different operations
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        id: 'new-playlist',
        external_user_id: externalUserId,
        name: 'New Playlist',
        created_at: new Date(),
      });
      mockDatabaseService.query.mockResolvedValueOnce([
        { id: playlistId, external_user_id: externalUserId, name: 'Existing', created_at: new Date() },
      ]);
      mockDatabaseService.queryOne.mockResolvedValueOnce({ id: playlistId });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const [created, all] = await Promise.all([
        service.create(externalUserId, { name: 'New Playlist' }),
        service.findAll(externalUserId),
        service.addTrack(playlistId, 'track-1', externalUserId),
      ]);

      expect(created.name).toBe('New Playlist');
      expect(all).toHaveLength(1);
    });
  });

  describe('SQL injection prevention', () => {
    const externalUserId = 'user-123';
    const playlistId = '550e8400-e29b-41d4-a716-446655440000';

    it('should use parameterized queries for create', async () => {
      const maliciousName = "'; DROP TABLE playlists; --";
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        id: playlistId,
        external_user_id: externalUserId,
        name: maliciousName,
        created_at: new Date(),
      });

      await service.create(externalUserId, { name: maliciousName });

      const query = mockDatabaseService.queryOne.mock.calls[0][0];
      expect(query).not.toContain(maliciousName);
      expect(query).toContain('$1');
      expect(query).toContain('$2');
    });

    it('should use parameterized queries for findAll', async () => {
      const maliciousUserId = "'; DROP TABLE playlists; --";
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.findAll(maliciousUserId);

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).not.toContain(maliciousUserId);
      expect(query).toContain('$1');
    });

    it('should use parameterized queries for update', async () => {
      const maliciousName = "'; UPDATE playlists SET name = 'hacked'; --";
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        id: playlistId,
        external_user_id: externalUserId,
        name: maliciousName,
        created_at: new Date(),
      });

      await service.update(playlistId, externalUserId, { name: maliciousName });

      const query = mockDatabaseService.queryOne.mock.calls[0][0];
      expect(query).not.toContain(maliciousName);
    });

    it('should use parameterized queries for remove', async () => {
      const maliciousId = "'; DELETE FROM playlists; --";
      mockDatabaseService.query.mockResolvedValueOnce([{ id: maliciousId }]);

      await service.remove(maliciousId, externalUserId);

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).not.toContain(maliciousId);
      expect(query).toContain('$1');
    });

    it('should use parameterized queries for addTrack', async () => {
      const maliciousTrackId = "'; INSERT INTO playlist_tracks VALUES ('a','b'); --";
      mockDatabaseService.queryOne.mockResolvedValueOnce({ id: playlistId });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.addTrack(playlistId, maliciousTrackId, externalUserId);

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).not.toContain(maliciousTrackId);
    });
  });

  describe('authorization checks', () => {
    const externalUserId = 'user-123';
    const otherUserId = 'other-user';
    const playlistId = '550e8400-e29b-41d4-a716-446655440000';

    it('should not return playlists belonging to other users in findAll', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.findAll(externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('external_user_id = $1'),
        [externalUserId],
      );
    });

    it('should throw when findOne is called for playlist owned by another user', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);

      await expect(
        service.findOne(playlistId, otherUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw when update is called for playlist owned by another user', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);

      await expect(
        service.update(playlistId, otherUserId, { name: 'Stolen' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw when remove is called for playlist owned by another user', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await expect(
        service.remove(playlistId, otherUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw when addTrack is called for playlist owned by another user', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);

      await expect(
        service.addTrack(playlistId, 'track-1', otherUserId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw when removeTrack is called for playlist owned by another user', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);

      await expect(
        service.removeTrack(playlistId, 'track-1', otherUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
