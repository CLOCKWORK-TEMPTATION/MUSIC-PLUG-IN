import { Test, TestingModule } from '@nestjs/testing';
import { InteractionsService } from './interactions.service';
import { DatabaseService } from '../config/database.service';
import { EventType, Mood, Activity, TimeBucket } from '@music-rec/shared';

describe('InteractionsService', () => {
  let service: InteractionsService;

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
        InteractionsService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<InteractionsService>(InteractionsService);
  });

  describe('recordInteraction', () => {
    const externalUserId = 'user-123';
    const trackId = '550e8400-e29b-41d4-a716-446655440000';

    const createMockDbRow = (overrides = {}) => ({
      id: 'interaction-1',
      external_user_id: externalUserId,
      track_id: trackId,
      event_type: EventType.PLAY,
      event_value: null,
      context: null,
      created_at: new Date('2024-01-15T10:00:00Z'),
      ...overrides,
    });

    it('should record a PLAY interaction successfully', async () => {
      const event = {
        trackId,
        eventType: EventType.PLAY,
        clientTs: '2024-01-15T10:00:00Z',
      };

      const mockRow = createMockDbRow();
      // For non-SKIP events, only 1 queryOne call is made (the INSERT)
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockRow);

      const result = await service.recordInteraction(externalUserId, event);

      expect(result.interaction).toEqual({
        id: 'interaction-1',
        externalUserId,
        trackId,
        eventType: EventType.PLAY,
        eventValue: null,
        context: null,
        createdAt: expect.any(Date),
      });
      expect(result.shouldRefreshRecommendations).toBe(false);
      // Only 1 call for non-SKIP events (no skip count query)
      expect(mockDatabaseService.queryOne).toHaveBeenCalledTimes(1);
    });

    it('should record a LIKE interaction with eventValue', async () => {
      const event = {
        trackId,
        eventType: EventType.LIKE,
        eventValue: 5,
        clientTs: '2024-01-15T10:00:00Z',
      };

      const mockRow = createMockDbRow({
        event_type: EventType.LIKE,
        event_value: 5,
      });

      mockDatabaseService.queryOne.mockResolvedValueOnce(mockRow);

      const result = await service.recordInteraction(externalUserId, event);

      expect(result.interaction.eventType).toBe(EventType.LIKE);
      expect(result.interaction.eventValue).toBe(5);
      expect(result.shouldRefreshRecommendations).toBe(false);
    });

    it('should record interaction with context (mood, activity, timeBucket)', async () => {
      const context = {
        mood: Mood.HAPPY,
        activity: Activity.EXERCISE,
        timeBucket: TimeBucket.MORNING,
      };

      const event = {
        trackId,
        eventType: EventType.PLAY,
        context,
        clientTs: '2024-01-15T10:00:00Z',
      };

      const mockRow = createMockDbRow({
        context: JSON.stringify(context),
      });

      mockDatabaseService.queryOne.mockResolvedValueOnce(mockRow);

      const result = await service.recordInteraction(externalUserId, event);

      expect(result.interaction.context).toBe(JSON.stringify(context));

      // Verify context was passed to the database
      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO interactions'),
        expect.arrayContaining([JSON.stringify(context)]),
      );
    });

    it('should record a DISLIKE interaction', async () => {
      const event = {
        trackId,
        eventType: EventType.DISLIKE,
        clientTs: '2024-01-15T10:00:00Z',
      };

      const mockRow = createMockDbRow({ event_type: EventType.DISLIKE });

      mockDatabaseService.queryOne.mockResolvedValueOnce(mockRow);

      const result = await service.recordInteraction(externalUserId, event);

      expect(result.interaction.eventType).toBe(EventType.DISLIKE);
      expect(result.shouldRefreshRecommendations).toBe(false);
    });

    it('should record an ADD_TO_PLAYLIST interaction', async () => {
      const event = {
        trackId,
        eventType: EventType.ADD_TO_PLAYLIST,
        clientTs: '2024-01-15T10:00:00Z',
      };

      const mockRow = createMockDbRow({ event_type: EventType.ADD_TO_PLAYLIST });

      mockDatabaseService.queryOne.mockResolvedValueOnce(mockRow);

      const result = await service.recordInteraction(externalUserId, event);

      expect(result.interaction.eventType).toBe(EventType.ADD_TO_PLAYLIST);
      expect(result.shouldRefreshRecommendations).toBe(false);
    });

    it('should pass null for optional fields when not provided', async () => {
      const event = {
        trackId,
        eventType: EventType.PLAY,
        clientTs: '2024-01-15T10:00:00Z',
      };

      mockDatabaseService.queryOne.mockResolvedValueOnce(createMockDbRow());

      await service.recordInteraction(externalUserId, event);

      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO interactions'),
        [externalUserId, trackId, EventType.PLAY, null, null],
      );
    });
  });

  describe('shouldRefreshRecommendations (via recordInteraction)', () => {
    const externalUserId = 'user-123';
    const trackId = '550e8400-e29b-41d4-a716-446655440000';

    const createSkipEvent = () => ({
      trackId,
      eventType: EventType.SKIP,
      clientTs: '2024-01-15T10:00:00Z',
    });

    const createMockSkipDbRow = () => ({
      id: 'interaction-1',
      external_user_id: externalUserId,
      track_id: trackId,
      event_type: EventType.SKIP,
      event_value: null,
      context: null,
      created_at: new Date(),
    });

    it('should NOT trigger refresh for a single SKIP (below threshold)', async () => {
      mockDatabaseService.queryOne
        .mockResolvedValueOnce(createMockSkipDbRow()) // INSERT
        .mockResolvedValueOnce({ count: '1' }); // Only 1 skip

      const result = await service.recordInteraction(externalUserId, createSkipEvent());

      expect(result.shouldRefreshRecommendations).toBe(false);
    });

    it('should trigger refresh when SKIP count reaches threshold (2)', async () => {
      mockDatabaseService.queryOne
        .mockResolvedValueOnce(createMockSkipDbRow()) // INSERT
        .mockResolvedValueOnce({ count: '2' }); // Exactly 2 skips

      const result = await service.recordInteraction(externalUserId, createSkipEvent());

      expect(result.shouldRefreshRecommendations).toBe(true);
    });

    it('should trigger refresh when SKIP count exceeds threshold (3+)', async () => {
      mockDatabaseService.queryOne
        .mockResolvedValueOnce(createMockSkipDbRow()) // INSERT
        .mockResolvedValueOnce({ count: '5' }); // 5 skips

      const result = await service.recordInteraction(externalUserId, createSkipEvent());

      expect(result.shouldRefreshRecommendations).toBe(true);
    });

    it('should NOT trigger refresh for non-SKIP events regardless of count', async () => {
      const playEvent = {
        trackId,
        eventType: EventType.PLAY,
        clientTs: '2024-01-15T10:00:00Z',
      };

      mockDatabaseService.queryOne.mockResolvedValueOnce({
        id: 'interaction-1',
        external_user_id: externalUserId,
        track_id: trackId,
        event_type: EventType.PLAY,
        event_value: null,
        context: null,
        created_at: new Date(),
      });

      const result = await service.recordInteraction(externalUserId, playEvent);

      expect(result.shouldRefreshRecommendations).toBe(false);
      // Only 1 call (INSERT), no skip count query for non-SKIP events
      expect(mockDatabaseService.queryOne).toHaveBeenCalledTimes(1);
    });

    it('should NOT trigger refresh for LIKE events', async () => {
      const likeEvent = {
        trackId,
        eventType: EventType.LIKE,
        clientTs: '2024-01-15T10:00:00Z',
      };

      mockDatabaseService.queryOne.mockResolvedValueOnce({
        id: 'interaction-1',
        external_user_id: externalUserId,
        track_id: trackId,
        event_type: EventType.LIKE,
        event_value: null,
        context: null,
        created_at: new Date(),
      });

      const result = await service.recordInteraction(externalUserId, likeEvent);

      expect(result.shouldRefreshRecommendations).toBe(false);
      expect(mockDatabaseService.queryOne).toHaveBeenCalledTimes(1);
    });

    it('should handle null count from database gracefully', async () => {
      mockDatabaseService.queryOne
        .mockResolvedValueOnce(createMockSkipDbRow()) // INSERT
        .mockResolvedValueOnce(null); // No result from count query

      const result = await service.recordInteraction(externalUserId, createSkipEvent());

      expect(result.shouldRefreshRecommendations).toBe(false);
    });

    it('should handle missing count field in result', async () => {
      mockDatabaseService.queryOne
        .mockResolvedValueOnce(createMockSkipDbRow()) // INSERT
        .mockResolvedValueOnce({}); // Empty object

      const result = await service.recordInteraction(externalUserId, createSkipEvent());

      expect(result.shouldRefreshRecommendations).toBe(false);
    });

    it('should query for SKIPs within the 60-second window', async () => {
      mockDatabaseService.queryOne
        .mockResolvedValueOnce(createMockSkipDbRow()) // INSERT
        .mockResolvedValueOnce({ count: '1' }); // Skip count

      await service.recordInteraction(externalUserId, createSkipEvent());

      // Verify the skip count query includes the 60-second window
      expect(mockDatabaseService.queryOne).toHaveBeenCalledTimes(2);
      expect(mockDatabaseService.queryOne).toHaveBeenLastCalledWith(
        expect.stringContaining("INTERVAL '60 seconds'"),
        [externalUserId],
      );
    });

    it('should make 2 queryOne calls for SKIP events (INSERT + count)', async () => {
      mockDatabaseService.queryOne
        .mockResolvedValueOnce(createMockSkipDbRow()) // INSERT
        .mockResolvedValueOnce({ count: '1' }); // Skip count

      await service.recordInteraction(externalUserId, createSkipEvent());

      expect(mockDatabaseService.queryOne).toHaveBeenCalledTimes(2);
    });
  });

  describe('getRecentInteractions', () => {
    const externalUserId = 'user-123';

    const createMockRows = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        id: `interaction-${i + 1}`,
        external_user_id: externalUserId,
        track_id: `track-${i + 1}`,
        event_type: EventType.PLAY,
        event_value: null,
        context: null,
        created_at: new Date(2024, 0, 15, 10, count - i),
      }));

    it('should return recent interactions for a user', async () => {
      const mockRows = createMockRows(3);
      mockDatabaseService.query.mockResolvedValueOnce(mockRows);

      const result = await service.getRecentInteractions(externalUserId);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        id: 'interaction-1',
        externalUserId,
        trackId: 'track-1',
        eventType: EventType.PLAY,
        eventValue: null,
        context: null,
        createdAt: expect.any(Date),
      });
    });

    it('should use default limit of 50 when not specified', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.getRecentInteractions(externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2'),
        [externalUserId, 50],
      );
    });

    it('should respect custom limit parameter', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.getRecentInteractions(externalUserId, 10);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2'),
        [externalUserId, 10],
      );
    });

    it('should return empty array when user has no interactions', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getRecentInteractions(externalUserId);

      expect(result).toEqual([]);
    });

    it('should map all fields correctly from database row', async () => {
      const mockRows = [
        {
          id: 'interaction-1',
          external_user_id: 'user-456',
          track_id: 'track-abc',
          event_type: EventType.LIKE,
          event_value: 5,
          context: { mood: Mood.HAPPY },
          created_at: new Date('2024-01-15T10:30:00Z'),
        },
      ];
      mockDatabaseService.query.mockResolvedValueOnce(mockRows);

      const result = await service.getRecentInteractions('user-456');

      expect(result[0]).toEqual({
        id: 'interaction-1',
        externalUserId: 'user-456',
        trackId: 'track-abc',
        eventType: EventType.LIKE,
        eventValue: 5,
        context: { mood: Mood.HAPPY },
        createdAt: new Date('2024-01-15T10:30:00Z'),
      });
    });

    it('should order results by created_at DESC', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.getRecentInteractions(externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        expect.any(Array),
      );
    });
  });

  describe('getRecentlySkippedTrackIds', () => {
    const externalUserId = 'user-123';

    it('should return distinct track IDs for recently skipped tracks', async () => {
      const mockRows = [
        { track_id: 'track-1' },
        { track_id: 'track-2' },
        { track_id: 'track-3' },
      ];
      mockDatabaseService.query.mockResolvedValueOnce(mockRows);

      const result = await service.getRecentlySkippedTrackIds(externalUserId);

      expect(result).toEqual(['track-1', 'track-2', 'track-3']);
    });

    it('should use default hoursBack of 24 when not specified', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.getRecentlySkippedTrackIds(externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '24 hours'"),
        expect.any(Array),
      );
    });

    it('should respect custom hoursBack parameter', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.getRecentlySkippedTrackIds(externalUserId, 12);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining("INTERVAL '12 hours'"),
        expect.any(Array),
      );
    });

    it('should use default limit of 20 when not specified', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.getRecentlySkippedTrackIds(externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2'),
        [externalUserId, 20],
      );
    });

    it('should respect custom limit parameter', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.getRecentlySkippedTrackIds(externalUserId, 24, 50);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.any(String),
        [externalUserId, 50],
      );
    });

    it('should return empty array when no skipped tracks found', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      const result = await service.getRecentlySkippedTrackIds(externalUserId);

      expect(result).toEqual([]);
    });

    it('should only query for SKIP event types', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.getRecentlySkippedTrackIds(externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining("event_type = 'SKIP'"),
        expect.any(Array),
      );
    });

    it('should return DISTINCT track IDs', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.getRecentlySkippedTrackIds(externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('DISTINCT track_id'),
        expect.any(Array),
      );
    });
  });

  describe('getUserInteractionStats', () => {
    const externalUserId = 'user-123';

    it('should return correct stats for a user with interactions', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        total_interactions: '100',
        like_count: '25',
        skip_count: '15',
        play_count: '60',
      });

      const result = await service.getUserInteractionStats(externalUserId);

      expect(result).toEqual({
        totalInteractions: 100,
        likeCount: 25,
        skipCount: 15,
        playCount: 60,
      });
    });

    it('should return zeros for a user with no interactions', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        total_interactions: '0',
        like_count: '0',
        skip_count: '0',
        play_count: '0',
      });

      const result = await service.getUserInteractionStats(externalUserId);

      expect(result).toEqual({
        totalInteractions: 0,
        likeCount: 0,
        skipCount: 0,
        playCount: 0,
      });
    });

    it('should handle null result from database', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);

      const result = await service.getUserInteractionStats(externalUserId);

      expect(result).toEqual({
        totalInteractions: 0,
        likeCount: 0,
        skipCount: 0,
        playCount: 0,
      });
    });

    it('should handle missing fields in result', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({});

      const result = await service.getUserInteractionStats(externalUserId);

      expect(result).toEqual({
        totalInteractions: 0,
        likeCount: 0,
        skipCount: 0,
        playCount: 0,
      });
    });

    it('should parse string numbers correctly', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        total_interactions: '999',
        like_count: '123',
        skip_count: '456',
        play_count: '789',
      });

      const result = await service.getUserInteractionStats(externalUserId);

      expect(result.totalInteractions).toBe(999);
      expect(result.likeCount).toBe(123);
      expect(result.skipCount).toBe(456);
      expect(result.playCount).toBe(789);
    });

    it('should query for the correct user', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        total_interactions: '0',
        like_count: '0',
        skip_count: '0',
        play_count: '0',
      });

      await service.getUserInteractionStats('specific-user-id');

      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        expect.any(String),
        ['specific-user-id'],
      );
    });

    it('should use conditional COUNT for event types', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        total_interactions: '0',
        like_count: '0',
        skip_count: '0',
        play_count: '0',
      });

      await service.getUserInteractionStats(externalUserId);

      const query = mockDatabaseService.queryOne.mock.calls[0][0];
      expect(query).toContain("CASE WHEN event_type = 'LIKE'");
      expect(query).toContain("CASE WHEN event_type = 'SKIP'");
      expect(query).toContain("CASE WHEN event_type = 'PLAY'");
    });
  });

  describe('edge cases and error handling', () => {
    const externalUserId = 'user-123';
    const trackId = '550e8400-e29b-41d4-a716-446655440000';

    it('should propagate database errors from recordInteraction', async () => {
      const dbError = new Error('Database connection failed');
      mockDatabaseService.queryOne.mockRejectedValueOnce(dbError);

      await expect(
        service.recordInteraction(externalUserId, {
          trackId,
          eventType: EventType.PLAY,
          clientTs: '2024-01-15T10:00:00Z',
        }),
      ).rejects.toThrow('Database connection failed');
    });

    it('should propagate database errors from getRecentInteractions', async () => {
      const dbError = new Error('Query timeout');
      mockDatabaseService.query.mockRejectedValueOnce(dbError);

      await expect(
        service.getRecentInteractions(externalUserId),
      ).rejects.toThrow('Query timeout');
    });

    it('should propagate database errors from getRecentlySkippedTrackIds', async () => {
      const dbError = new Error('Connection pool exhausted');
      mockDatabaseService.query.mockRejectedValueOnce(dbError);

      await expect(
        service.getRecentlySkippedTrackIds(externalUserId),
      ).rejects.toThrow('Connection pool exhausted');
    });

    it('should propagate database errors from getUserInteractionStats', async () => {
      const dbError = new Error('SQL syntax error');
      mockDatabaseService.queryOne.mockRejectedValueOnce(dbError);

      await expect(
        service.getUserInteractionStats(externalUserId),
      ).rejects.toThrow('SQL syntax error');
    });

    it('should handle very long user IDs', async () => {
      const longUserId = 'a'.repeat(500);
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        id: 'interaction-1',
        external_user_id: longUserId,
        track_id: trackId,
        event_type: EventType.PLAY,
        event_value: null,
        context: null,
        created_at: new Date(),
      });

      const result = await service.recordInteraction(longUserId, {
        trackId,
        eventType: EventType.PLAY,
        clientTs: '2024-01-15T10:00:00Z',
      });

      expect(result.interaction.externalUserId).toBe(longUserId);
    });

    it('should handle special characters in user ID', async () => {
      const specialUserId = "user-with'quotes\"and\\backslashes";
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.getRecentInteractions(specialUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.any(String),
        [specialUserId, 50],
      );
    });

    it('should handle large eventValue numbers', async () => {
      const event = {
        trackId,
        eventType: EventType.LIKE,
        eventValue: Number.MAX_SAFE_INTEGER,
        clientTs: '2024-01-15T10:00:00Z',
      };

      mockDatabaseService.queryOne.mockResolvedValueOnce({
        id: 'interaction-1',
        external_user_id: externalUserId,
        track_id: trackId,
        event_type: EventType.LIKE,
        event_value: Number.MAX_SAFE_INTEGER,
        context: null,
        created_at: new Date(),
      });

      const result = await service.recordInteraction(externalUserId, event);

      expect(result.interaction.eventValue).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('concurrent operations', () => {
    const externalUserId = 'user-123';
    const trackId = '550e8400-e29b-41d4-a716-446655440000';

    it('should handle multiple concurrent recordInteraction calls', async () => {
      const events = [
        { trackId, eventType: EventType.PLAY, clientTs: '2024-01-15T10:00:00Z' },
        { trackId, eventType: EventType.LIKE, clientTs: '2024-01-15T10:00:01Z' },
        { trackId, eventType: EventType.SKIP, clientTs: '2024-01-15T10:00:02Z' },
      ];

      // Setup mocks for all calls
      mockDatabaseService.queryOne
        // First call: PLAY (only INSERT, no count query)
        .mockResolvedValueOnce({
          id: 'interaction-1',
          external_user_id: externalUserId,
          track_id: trackId,
          event_type: EventType.PLAY,
          event_value: null,
          context: null,
          created_at: new Date(),
        })
        // Second call: LIKE (only INSERT, no count query)
        .mockResolvedValueOnce({
          id: 'interaction-2',
          external_user_id: externalUserId,
          track_id: trackId,
          event_type: EventType.LIKE,
          event_value: null,
          context: null,
          created_at: new Date(),
        })
        // Third call: SKIP INSERT
        .mockResolvedValueOnce({
          id: 'interaction-3',
          external_user_id: externalUserId,
          track_id: trackId,
          event_type: EventType.SKIP,
          event_value: null,
          context: null,
          created_at: new Date(),
        })
        // Fourth call: SKIP count query
        .mockResolvedValueOnce({ count: '1' });

      const results = await Promise.all(
        events.map((event) => service.recordInteraction(externalUserId, event)),
      );

      expect(results).toHaveLength(3);
      expect(results[0].interaction.eventType).toBe(EventType.PLAY);
      expect(results[1].interaction.eventType).toBe(EventType.LIKE);
      expect(results[2].interaction.eventType).toBe(EventType.SKIP);
    });
  });

  describe('database query construction', () => {
    const externalUserId = 'user-123';
    const trackId = '550e8400-e29b-41d4-a716-446655440000';

    it('should construct INSERT query with correct columns', async () => {
      const event = {
        trackId,
        eventType: EventType.PLAY,
        clientTs: '2024-01-15T10:00:00Z',
      };

      mockDatabaseService.queryOne.mockResolvedValueOnce({
        id: 'interaction-1',
        external_user_id: externalUserId,
        track_id: trackId,
        event_type: EventType.PLAY,
        event_value: null,
        context: null,
        created_at: new Date(),
      });

      await service.recordInteraction(externalUserId, event);

      const insertQuery = mockDatabaseService.queryOne.mock.calls[0][0];
      expect(insertQuery).toContain('external_user_id');
      expect(insertQuery).toContain('track_id');
      expect(insertQuery).toContain('event_type');
      expect(insertQuery).toContain('event_value');
      expect(insertQuery).toContain('context');
      expect(insertQuery).toContain('RETURNING *');
    });

    it('should use parameterized queries to prevent SQL injection', async () => {
      const maliciousUserId = "'; DROP TABLE interactions; --";
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.getRecentInteractions(maliciousUserId);

      // The malicious input should be passed as a parameter, not interpolated
      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.any(String),
        [maliciousUserId, 50],
      );

      // Query should use $1 placeholder, not the actual value
      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).toContain('$1');
      expect(query).not.toContain(maliciousUserId);
    });
  });
});
