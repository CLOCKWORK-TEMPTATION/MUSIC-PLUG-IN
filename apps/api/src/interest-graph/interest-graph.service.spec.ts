import { Test, TestingModule } from '@nestjs/testing';
import { InterestGraphService } from './interest-graph.service';
import { DatabaseService } from '../config/database.service';

describe('InterestGraphService', () => {
  let service: InterestGraphService;

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
        InterestGraphService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<InterestGraphService>(InterestGraphService);
  });

  describe('getOrCompute', () => {
    const externalUserId = 'user-123';

    it('should return existing graph when found in database', async () => {
      const existingGraph = {
        version: 1,
        generatedBy: 'heuristic',
        topArtists: { 'Artist A': 1, 'Artist B': 0.8 },
        topGenres: { rock: 1, pop: 0.5 },
        avoidArtists: {},
        avoidGenres: {},
      };

      mockDatabaseService.queryOne.mockResolvedValueOnce({ graph: existingGraph });

      const result = await service.getOrCompute(externalUserId);

      expect(result).toEqual(existingGraph);
      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('SELECT graph FROM user_interest_graph'),
        [externalUserId],
      );
      // Should not query for interactions if graph exists
      expect(mockDatabaseService.query).not.toHaveBeenCalled();
    });

    it('should compute and store graph when not found', async () => {
      const mockInteractions = [
        { event_type: 'LIKE', artist: 'Artist A', genre: 'rock', created_at: new Date() },
        { event_type: 'PLAY', artist: 'Artist A', genre: 'rock', created_at: new Date() },
        { event_type: 'PLAY', artist: 'Artist B', genre: 'pop', created_at: new Date() },
      ];

      mockDatabaseService.queryOne.mockResolvedValueOnce(null); // No existing graph
      mockDatabaseService.query.mockResolvedValueOnce(mockInteractions); // Compute query
      mockDatabaseService.query.mockResolvedValueOnce([]); // Upsert query

      const result = await service.getOrCompute(externalUserId);

      expect(result).not.toBeNull();
      expect(result.version).toBe(1);
      expect(result.generatedBy).toBe('heuristic');
      expect(result.topArtists).toBeDefined();
      expect(result.topGenres).toBeDefined();
    });

    it('should return null when no interactions exist', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      expect(result).toBeNull();
    });

    it('should return null when existing graph field is null', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({ graph: null });
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      expect(result).toBeNull();
    });

    it('should upsert computed graph to database', async () => {
      const mockInteractions = [
        { event_type: 'LIKE', artist: 'Artist A', genre: 'rock', created_at: new Date() },
      ];

      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce(mockInteractions);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.getOrCompute(externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_interest_graph'),
        expect.arrayContaining([externalUserId, expect.any(String)]),
      );
    });
  });

  describe('refresh', () => {
    const externalUserId = 'user-123';

    it('should recompute and update graph', async () => {
      const mockInteractions = [
        { event_type: 'LIKE', artist: 'Artist A', genre: 'rock', created_at: new Date() },
        { event_type: 'LIKE', artist: 'Artist B', genre: 'pop', created_at: new Date() },
      ];

      mockDatabaseService.query.mockResolvedValueOnce(mockInteractions);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.refresh(externalUserId);

      expect(result).not.toBeNull();
      expect(result.topArtists).toBeDefined();
      expect(mockDatabaseService.query).toHaveBeenCalledTimes(2);
    });

    it('should return null when no interactions exist', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.refresh(externalUserId);

      expect(result).toBeNull();
    });

    it('should not upsert when compute returns null', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.refresh(externalUserId);

      // Only one query call (compute), no upsert
      expect(mockDatabaseService.query).toHaveBeenCalledTimes(1);
    });

    it('should always recompute even if graph exists', async () => {
      const mockInteractions = [
        { event_type: 'PLAY', artist: 'Artist A', genre: 'jazz', created_at: new Date() },
      ];

      mockDatabaseService.query.mockResolvedValueOnce(mockInteractions);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.refresh(externalUserId);

      expect(result).not.toBeNull();
      // Should not check for existing graph
      expect(mockDatabaseService.queryOne).not.toHaveBeenCalled();
    });
  });

  describe('compute (via getOrCompute)', () => {
    const externalUserId = 'user-123';

    const createMockInteraction = (eventType: string, artist: string, genre: string) => ({
      event_type: eventType,
      artist,
      genre,
      created_at: new Date(),
    });

    it('should correctly weight LIKE interactions (+2.0)', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        createMockInteraction('LIKE', 'Artist A', 'rock'),
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      expect(result.topArtists['Artist A']).toBe(1);
      expect(result.topGenres['rock']).toBe(1);
    });

    it('should correctly weight PLAY interactions (+1.0)', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        createMockInteraction('PLAY', 'Artist A', 'rock'),
        createMockInteraction('LIKE', 'Artist B', 'pop'),
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      // Artist B with LIKE (2.0) should be higher than Artist A with PLAY (1.0)
      expect(result.topArtists['Artist B']).toBe(1);
      expect(result.topArtists['Artist A']).toBe(0.5);
    });

    it('should correctly weight SKIP interactions (-1.0)', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        createMockInteraction('SKIP', 'Artist A', 'rock'),
        createMockInteraction('LIKE', 'Artist B', 'pop'),
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      // Artist A should be in avoidArtists due to negative score
      expect(result.avoidArtists['Artist A']).toBeDefined();
      expect(result.topArtists['Artist B']).toBe(1);
    });

    it('should correctly weight DISLIKE interactions (-2.0)', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        createMockInteraction('DISLIKE', 'Artist A', 'country'),
        createMockInteraction('SKIP', 'Artist B', 'pop'),
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      // Artist A with DISLIKE (-2.0) should have higher avoid score than Artist B with SKIP (-1.0)
      expect(result.avoidArtists['Artist A']).toBe(1);
      expect(result.avoidArtists['Artist B']).toBe(0.5);
    });

    it('should accumulate scores for same artist', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        createMockInteraction('LIKE', 'Artist A', 'rock'),
        createMockInteraction('LIKE', 'Artist A', 'rock'),
        createMockInteraction('PLAY', 'Artist A', 'rock'),
        createMockInteraction('LIKE', 'Artist B', 'pop'),
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      // Artist A: 2.0 + 2.0 + 1.0 = 5.0, Artist B: 2.0
      expect(result.topArtists['Artist A']).toBe(1);
      expect(result.topArtists['Artist B']).toBe(0.4); // 2.0/5.0 = 0.4
    });

    it('should accumulate scores for same genre', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        createMockInteraction('LIKE', 'Artist A', 'rock'),
        createMockInteraction('LIKE', 'Artist B', 'rock'),
        createMockInteraction('PLAY', 'Artist C', 'rock'),
        createMockInteraction('LIKE', 'Artist D', 'pop'),
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      // Rock: 2.0 + 2.0 + 1.0 = 5.0, Pop: 2.0
      expect(result.topGenres['rock']).toBe(1);
      expect(result.topGenres['pop']).toBe(0.4);
    });

    it('should handle null artist gracefully', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        { event_type: 'LIKE', artist: null, genre: 'rock', created_at: new Date() },
        createMockInteraction('LIKE', 'Artist B', 'pop'),
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      expect(result.topArtists['Artist B']).toBe(1);
      expect(Object.keys(result.topArtists)).not.toContain('null');
    });

    it('should handle null genre gracefully', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        { event_type: 'LIKE', artist: 'Artist A', genre: null, created_at: new Date() },
        createMockInteraction('LIKE', 'Artist B', 'pop'),
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      expect(result.topGenres['pop']).toBe(1);
      expect(Object.keys(result.topGenres)).not.toContain('null');
    });

    it('should generate correct graph structure', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        createMockInteraction('LIKE', 'Artist A', 'rock'),
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      expect(result).toHaveProperty('version', 1);
      expect(result).toHaveProperty('generatedBy', 'heuristic');
      expect(result).toHaveProperty('updatedAt');
      expect(result).toHaveProperty('windowDays', 90);
      expect(result).toHaveProperty('topArtists');
      expect(result).toHaveProperty('topGenres');
      expect(result).toHaveProperty('avoidArtists');
      expect(result).toHaveProperty('avoidGenres');
    });

    it('should query last 90 days of interactions', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.getOrCompute(externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '90 days'"),
        expect.any(Array),
      );
    });

    it('should limit to 500 interactions', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.getOrCompute(externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 500'),
        expect.any(Array),
      );
    });

    it('should filter for relevant event types', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.getOrCompute(externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining("('PLAY','LIKE','SKIP','DISLIKE')"),
        expect.any(Array),
      );
    });

    it('should order by created_at DESC', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.getOrCompute(externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY i.created_at DESC'),
        expect.any(Array),
      );
    });
  });

  describe('normalizeTop (via compute)', () => {
    const externalUserId = 'user-123';

    const createMockInteraction = (eventType: string, artist: string, genre: string) => ({
      event_type: eventType,
      artist,
      genre,
      created_at: new Date(),
    });

    it('should normalize scores to 0-1 range', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        createMockInteraction('LIKE', 'Artist A', 'rock'), // 2.0
        createMockInteraction('PLAY', 'Artist B', 'pop'),  // 1.0
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      expect(result.topArtists['Artist A']).toBe(1);
      expect(result.topArtists['Artist B']).toBe(0.5);
    });

    it('should limit to top 20 items', async () => {
      const manyInteractions = Array.from({ length: 30 }, (_, i) =>
        createMockInteraction('LIKE', `Artist ${i}`, `genre-${i}`)
      );

      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce(manyInteractions);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      expect(Object.keys(result.topArtists).length).toBeLessThanOrEqual(20);
      expect(Object.keys(result.topGenres).length).toBeLessThanOrEqual(20);
    });

    it('should sort by score descending', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        createMockInteraction('PLAY', 'Artist C', 'rock'),   // 1.0
        createMockInteraction('LIKE', 'Artist A', 'rock'),   // 2.0
        createMockInteraction('LIKE', 'Artist B', 'rock'),   // 2.0
        createMockInteraction('LIKE', 'Artist B', 'rock'),   // +2.0 = 4.0 total
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      const artistEntries = Object.entries(result.topArtists);
      // Artist B (4.0) should be first, then Artist A (2.0), then Artist C (1.0)
      expect(artistEntries[0][0]).toBe('Artist B');
      expect(artistEntries[0][1]).toBe(1);
    });

    it('should round normalized scores to 4 decimal places', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        createMockInteraction('LIKE', 'Artist A', 'rock'),
        createMockInteraction('LIKE', 'Artist A', 'rock'),
        createMockInteraction('LIKE', 'Artist A', 'rock'), // 6.0
        createMockInteraction('PLAY', 'Artist B', 'pop'),  // 1.0
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      // 1.0 / 6.0 = 0.16666... should be 0.1667
      expect(result.topArtists['Artist B']).toBe(0.1667);
    });

    it('should handle empty map', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      // All interactions with null artist/genre
      mockDatabaseService.query.mockResolvedValueOnce([
        { event_type: 'LIKE', artist: null, genre: null, created_at: new Date() },
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      expect(result.topArtists).toEqual({});
      expect(result.topGenres).toEqual({});
    });

    it('should handle all zero or negative scores for avoidArtists', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        createMockInteraction('SKIP', 'Artist A', 'rock'),
        createMockInteraction('DISLIKE', 'Artist B', 'pop'),
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      // Artists with negative scores appear in both topArtists (with 0 normalized) and avoidArtists
      // The normalizeTop function normalizes based on max value, negative values become 0
      expect(Object.keys(result.avoidArtists)).toContain('Artist A');
      expect(Object.keys(result.avoidArtists)).toContain('Artist B');
    });
  });

  describe('upsert (via getOrCompute/refresh)', () => {
    const externalUserId = 'user-123';

    it('should use ON CONFLICT for upsert', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        { event_type: 'LIKE', artist: 'Artist A', genre: 'rock', created_at: new Date() },
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.getOrCompute(externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (external_user_id)'),
        expect.any(Array),
      );
    });

    it('should increment version on update', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        { event_type: 'LIKE', artist: 'Artist A', genre: 'rock', created_at: new Date() },
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.getOrCompute(externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('version = user_interest_graph.version + 1'),
        expect.any(Array),
      );
    });

    it('should update updated_at on conflict', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        { event_type: 'LIKE', artist: 'Artist A', genre: 'rock', created_at: new Date() },
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.getOrCompute(externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('updated_at = NOW()'),
        expect.any(Array),
      );
    });

    it('should store graph as JSONB', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        { event_type: 'LIKE', artist: 'Artist A', genre: 'rock', created_at: new Date() },
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.getOrCompute(externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('$2::jsonb'),
        expect.any(Array),
      );
    });

    it('should stringify graph for storage', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        { event_type: 'LIKE', artist: 'Artist A', genre: 'rock', created_at: new Date() },
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.getOrCompute(externalUserId);

      const upsertCall = mockDatabaseService.query.mock.calls[1];
      const graphParam = upsertCall[1][1];

      expect(() => JSON.parse(graphParam)).not.toThrow();
      const parsed = JSON.parse(graphParam);
      expect(parsed).toHaveProperty('version');
      expect(parsed).toHaveProperty('topArtists');
    });
  });

  describe('edge cases and error handling', () => {
    const externalUserId = 'user-123';

    it('should propagate database errors from getOrCompute', async () => {
      const dbError = new Error('Database connection failed');
      mockDatabaseService.queryOne.mockRejectedValueOnce(dbError);

      await expect(service.getOrCompute(externalUserId)).rejects.toThrow(
        'Database connection failed',
      );
    });

    it('should propagate database errors from refresh', async () => {
      const dbError = new Error('Query timeout');
      mockDatabaseService.query.mockRejectedValueOnce(dbError);

      await expect(service.refresh(externalUserId)).rejects.toThrow(
        'Query timeout',
      );
    });

    it('should propagate database errors during upsert', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        { event_type: 'LIKE', artist: 'Artist A', genre: 'rock', created_at: new Date() },
      ]);
      mockDatabaseService.query.mockRejectedValueOnce(new Error('Upsert failed'));

      await expect(service.getOrCompute(externalUserId)).rejects.toThrow(
        'Upsert failed',
      );
    });

    it('should handle very long artist names', async () => {
      const longArtistName = 'A'.repeat(500);
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        { event_type: 'LIKE', artist: longArtistName, genre: 'rock', created_at: new Date() },
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      expect(result.topArtists[longArtistName]).toBe(1);
    });

    it('should handle special characters in artist/genre names', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        { event_type: 'LIKE', artist: "Rock'n'Roll Band", genre: 'R&B/Soul', created_at: new Date() },
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      expect(result.topArtists["Rock'n'Roll Band"]).toBe(1);
      expect(result.topGenres['R&B/Soul']).toBe(1);
    });

    it('should handle unicode characters in artist/genre names', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        { event_type: 'LIKE', artist: '宇多田ヒカル', genre: 'J-Pop', created_at: new Date() },
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      expect(result.topArtists['宇多田ヒカル']).toBe(1);
    });

    it('should handle unknown event types gracefully', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        { event_type: 'UNKNOWN_EVENT', artist: 'Artist A', genre: 'rock', created_at: new Date() },
        { event_type: 'LIKE', artist: 'Artist B', genre: 'pop', created_at: new Date() },
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      // Unknown event has 0 weight, Artist A appears with 0 score, Artist B has highest
      expect(result.topArtists['Artist A']).toBe(0);
      expect(result.topArtists['Artist B']).toBe(1);
    });

    it('should handle empty string artist/genre', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        { event_type: 'LIKE', artist: '', genre: '', created_at: new Date() },
        { event_type: 'LIKE', artist: 'Artist B', genre: 'pop', created_at: new Date() },
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      // Empty strings are falsy in JS, so `if (r.artist)` is false - they are skipped
      expect(result.topArtists['']).toBeUndefined();
      expect(result.topGenres['']).toBeUndefined();
      expect(result.topArtists['Artist B']).toBe(1);
      expect(result.topGenres['pop']).toBe(1);
    });
  });

  describe('concurrent operations', () => {
    it('should handle sequential getOrCompute calls for different users', async () => {
      const users = ['user-1', 'user-2', 'user-3'];

      for (let i = 0; i < users.length; i++) {
        mockDatabaseService.queryOne.mockResolvedValueOnce(null);
        mockDatabaseService.query.mockResolvedValueOnce([
          { event_type: 'LIKE', artist: `Artist ${i}`, genre: 'rock', created_at: new Date() },
        ]);
        mockDatabaseService.query.mockResolvedValueOnce([]);

        const result = await service.getOrCompute(users[i]);
        expect(result).not.toBeNull();
        expect(result.version).toBe(1);
      }

      expect(mockDatabaseService.queryOne).toHaveBeenCalledTimes(3);
    });

    it('should handle sequential refresh calls for different users', async () => {
      const users = ['user-1', 'user-2', 'user-3'];

      for (let i = 0; i < users.length; i++) {
        mockDatabaseService.query.mockResolvedValueOnce([
          { event_type: 'LIKE', artist: `Artist ${i}`, genre: 'pop', created_at: new Date() },
        ]);
        mockDatabaseService.query.mockResolvedValueOnce([]);

        const result = await service.refresh(users[i]);
        expect(result).not.toBeNull();
      }

      expect(mockDatabaseService.query).toHaveBeenCalledTimes(6); // 2 calls per user
    });
  });

  describe('SQL injection prevention', () => {
    const externalUserId = 'user-123';

    it('should use parameterized queries for getOrCompute', async () => {
      const maliciousUserId = "'; DROP TABLE user_interest_graph; --";
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.getOrCompute(maliciousUserId);

      const selectQuery = mockDatabaseService.queryOne.mock.calls[0][0];
      expect(selectQuery).toContain('$1');
      expect(selectQuery).not.toContain(maliciousUserId);
    });

    it('should use parameterized queries for refresh', async () => {
      const maliciousUserId = "'; DELETE FROM interactions; --";
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.refresh(maliciousUserId);

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).toContain('$1');
      expect(query).not.toContain(maliciousUserId);
    });

    it('should use parameterized queries for upsert', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        { event_type: 'LIKE', artist: 'Artist A', genre: 'rock', created_at: new Date() },
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.getOrCompute(externalUserId);

      const upsertQuery = mockDatabaseService.query.mock.calls[1][0];
      expect(upsertQuery).toContain('$1');
      expect(upsertQuery).toContain('$2');
    });
  });

  describe('graph consistency', () => {
    const externalUserId = 'user-123';

    it('should include updatedAt timestamp in graph', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        { event_type: 'LIKE', artist: 'Artist A', genre: 'rock', created_at: new Date() },
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      expect(result.updatedAt).toBeDefined();
      expect(() => new Date(result.updatedAt)).not.toThrow();
    });

    it('should maintain consistent windowDays value', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        { event_type: 'LIKE', artist: 'Artist A', genre: 'rock', created_at: new Date() },
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      expect(result.windowDays).toBe(90);
    });

    it('should balance positive and negative scores correctly', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.query.mockResolvedValueOnce([
        { event_type: 'LIKE', artist: 'Artist A', genre: 'rock', created_at: new Date() },   // +2
        { event_type: 'SKIP', artist: 'Artist A', genre: 'rock', created_at: new Date() },   // -1
        { event_type: 'DISLIKE', artist: 'Artist B', genre: 'pop', created_at: new Date() }, // -2
      ]);
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getOrCompute(externalUserId);

      // Artist A: 2 - 1 = 1 (positive, highest in topArtists)
      // Artist B: -2 (negative, in avoidArtists, also appears in topArtists with negative value)
      expect(result.topArtists['Artist A']).toBe(1);
      expect(result.avoidArtists['Artist B']).toBe(1);
      // Artist B has negative score, will not be filtered by normalizeTop but gets 0 or negative after normalization
      expect(result.topArtists['Artist B']).toBeDefined();
    });
  });
});
