import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { DatabaseService } from '../config/database.service';

describe('UsersService', () => {
  let service: UsersService;

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
        UsersService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('findOrCreateProfile', () => {
    const externalUserId = 'user-123';

    const createMockDbProfile = (overrides = {}) => ({
      external_user_id: externalUserId,
      preferred_genres: ['rock', 'pop'],
      disliked_genres: ['country'],
      last_active_at: new Date('2024-01-15T10:00:00Z'),
      profile_embedding: null,
      ...overrides,
    });

    it('should return existing profile when user exists', async () => {
      const mockProfile = createMockDbProfile();
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.findOrCreateProfile(externalUserId);

      expect(result).toEqual({
        externalUserId,
        preferredGenres: ['rock', 'pop'],
        dislikedGenres: ['country'],
        lastActiveAt: new Date('2024-01-15T10:00:00Z'),
        profileEmbedding: undefined,
      });

      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        'SELECT * FROM user_profiles WHERE external_user_id = $1',
        [externalUserId],
      );
    });

    it('should create new profile when user does not exist', async () => {
      const newProfile = createMockDbProfile({
        preferred_genres: [],
        disliked_genres: [],
      });

      mockDatabaseService.queryOne
        .mockResolvedValueOnce(null) // First query returns no existing profile
        .mockResolvedValueOnce(newProfile); // Insert returns new profile

      const result = await service.findOrCreateProfile(externalUserId);

      expect(result).toEqual({
        externalUserId,
        preferredGenres: [],
        dislikedGenres: [],
        lastActiveAt: expect.any(Date),
        profileEmbedding: undefined,
      });

      expect(mockDatabaseService.queryOne).toHaveBeenCalledTimes(2);
      expect(mockDatabaseService.queryOne).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('INSERT INTO user_profiles'),
        [externalUserId, [], []],
      );
    });

    it('should handle empty genre arrays correctly', async () => {
      const mockProfile = createMockDbProfile({
        preferred_genres: [],
        disliked_genres: [],
      });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.findOrCreateProfile(externalUserId);

      expect(result.preferredGenres).toEqual([]);
      expect(result.dislikedGenres).toEqual([]);
    });

    it('should handle null genre arrays correctly', async () => {
      const mockProfile = createMockDbProfile({
        preferred_genres: null,
        disliked_genres: null,
      });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.findOrCreateProfile(externalUserId);

      expect(result.preferredGenres).toEqual([]);
      expect(result.dislikedGenres).toEqual([]);
    });

    it('should parse profile embedding from array format', async () => {
      const mockProfile = createMockDbProfile({
        profile_embedding: [0.1, 0.2, 0.3, 0.4],
      });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.findOrCreateProfile(externalUserId);

      expect(result.profileEmbedding).toEqual([0.1, 0.2, 0.3, 0.4]);
    });

    it('should parse profile embedding from string format', async () => {
      const mockProfile = createMockDbProfile({
        profile_embedding: '[0.1, 0.2, 0.3, 0.4]',
      });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.findOrCreateProfile(externalUserId);

      expect(result.profileEmbedding).toEqual([0.1, 0.2, 0.3, 0.4]);
    });

    it('should parse profile embedding with spaces in string format', async () => {
      const mockProfile = createMockDbProfile({
        profile_embedding: '[ 0.1 , 0.2 , 0.3 , 0.4 ]',
      });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.findOrCreateProfile(externalUserId);

      expect(result.profileEmbedding).toEqual([0.1, 0.2, 0.3, 0.4]);
    });

    it('should handle profile embedding without brackets', async () => {
      const mockProfile = createMockDbProfile({
        profile_embedding: '0.1, 0.2, 0.3, 0.4',
      });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.findOrCreateProfile(externalUserId);

      expect(result.profileEmbedding).toEqual([0.1, 0.2, 0.3, 0.4]);
    });

    it('should return undefined for empty string embedding', async () => {
      const mockProfile = createMockDbProfile({
        profile_embedding: '',
      });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.findOrCreateProfile(externalUserId);

      expect(result.profileEmbedding).toBeUndefined();
    });

    it('should return undefined for empty brackets embedding', async () => {
      const mockProfile = createMockDbProfile({
        profile_embedding: '[]',
      });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.findOrCreateProfile(externalUserId);

      expect(result.profileEmbedding).toBeUndefined();
    });

    it('should handle multiple genre values', async () => {
      const mockProfile = createMockDbProfile({
        preferred_genres: ['rock', 'pop', 'indie', 'alternative', 'jazz'],
        disliked_genres: ['country', 'classical'],
      });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.findOrCreateProfile(externalUserId);

      expect(result.preferredGenres).toEqual([
        'rock',
        'pop',
        'indie',
        'alternative',
        'jazz',
      ]);
      expect(result.dislikedGenres).toEqual(['country', 'classical']);
    });
  });

  describe('updatePreferences', () => {
    const externalUserId = 'user-123';

    const createMockUpdatedProfile = (overrides = {}) => ({
      external_user_id: externalUserId,
      preferred_genres: ['rock', 'pop'],
      disliked_genres: ['country'],
      last_active_at: new Date('2024-01-15T10:00:00Z'),
      profile_embedding: null,
      ...overrides,
    });

    it('should update preferred genres only', async () => {
      const mockProfile = createMockUpdatedProfile({
        preferred_genres: ['electronic', 'jazz'],
      });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.updatePreferences(externalUserId, [
        'electronic',
        'jazz',
      ]);

      expect(result.preferredGenres).toEqual(['electronic', 'jazz']);
      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('preferred_genres = $1'),
        expect.arrayContaining([['electronic', 'jazz'], externalUserId]),
      );
    });

    it('should update disliked genres only', async () => {
      const mockProfile = createMockUpdatedProfile({
        disliked_genres: ['metal', 'punk'],
      });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.updatePreferences(
        externalUserId,
        undefined,
        ['metal', 'punk'],
      );

      expect(result.dislikedGenres).toEqual(['metal', 'punk']);
      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('disliked_genres = $1'),
        expect.arrayContaining([['metal', 'punk'], externalUserId]),
      );
    });

    it('should update both preferred and disliked genres', async () => {
      const mockProfile = createMockUpdatedProfile({
        preferred_genres: ['rock'],
        disliked_genres: ['pop'],
      });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.updatePreferences(
        externalUserId,
        ['rock'],
        ['pop'],
      );

      expect(result.preferredGenres).toEqual(['rock']);
      expect(result.dislikedGenres).toEqual(['pop']);
      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('preferred_genres = $1'),
        expect.arrayContaining([['rock'], ['pop'], externalUserId]),
      );
    });

    it('should always update last_active_at', async () => {
      const mockProfile = createMockUpdatedProfile();
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      await service.updatePreferences(externalUserId, ['rock']);

      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('last_active_at = NOW()'),
        expect.any(Array),
      );
    });

    it('should create profile when update returns null (profile does not exist)', async () => {
      const newProfile = createMockUpdatedProfile({
        preferred_genres: [],
        disliked_genres: [],
      });

      mockDatabaseService.queryOne
        .mockResolvedValueOnce(null) // UPDATE returns null
        .mockResolvedValueOnce(null) // findOrCreateProfile: SELECT returns null
        .mockResolvedValueOnce(newProfile); // findOrCreateProfile: INSERT returns profile

      const result = await service.updatePreferences(externalUserId, ['rock']);

      expect(result).toBeDefined();
      expect(mockDatabaseService.queryOne).toHaveBeenCalledTimes(3);
    });

    it('should handle empty arrays for preferences', async () => {
      const mockProfile = createMockUpdatedProfile({
        preferred_genres: [],
        disliked_genres: [],
      });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.updatePreferences(externalUserId, [], []);

      expect(result.preferredGenres).toEqual([]);
      expect(result.dislikedGenres).toEqual([]);
    });

    it('should parse profile embedding in update response', async () => {
      const mockProfile = createMockUpdatedProfile({
        profile_embedding: [0.5, 0.6, 0.7],
      });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.updatePreferences(externalUserId, ['rock']);

      expect(result.profileEmbedding).toEqual([0.5, 0.6, 0.7]);
    });

    it('should construct correct UPDATE query with dynamic parameters', async () => {
      const mockProfile = createMockUpdatedProfile();
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      await service.updatePreferences(
        externalUserId,
        ['rock', 'pop'],
        ['country'],
      );

      const call = mockDatabaseService.queryOne.mock.calls[0];
      const query = call[0];
      const params = call[1];

      expect(query).toContain('UPDATE user_profiles');
      expect(query).toContain('SET');
      expect(query).toContain('preferred_genres = $1');
      expect(query).toContain('disliked_genres = $2');
      expect(query).toContain('WHERE external_user_id = $3');
      expect(query).toContain('RETURNING *');
      expect(params).toEqual([['rock', 'pop'], ['country'], externalUserId]);
    });

    it('should handle update with only preferred genres parameter index', async () => {
      const mockProfile = createMockUpdatedProfile();
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      await service.updatePreferences(externalUserId, ['jazz']);

      const call = mockDatabaseService.queryOne.mock.calls[0];
      const query = call[0];
      const params = call[1];

      expect(query).toContain('preferred_genres = $1');
      expect(query).toContain('WHERE external_user_id = $2');
      expect(params).toEqual([['jazz'], externalUserId]);
    });

    it('should handle update with only disliked genres parameter index', async () => {
      const mockProfile = createMockUpdatedProfile();
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      await service.updatePreferences(externalUserId, undefined, ['metal']);

      const call = mockDatabaseService.queryOne.mock.calls[0];
      const query = call[0];
      const params = call[1];

      expect(query).toContain('disliked_genres = $1');
      expect(query).toContain('WHERE external_user_id = $2');
      expect(params).toEqual([['metal'], externalUserId]);
    });
  });

  describe('updateLastActive', () => {
    const externalUserId = 'user-123';

    it('should update last_active_at to current time', async () => {
      mockDatabaseService.query.mockResolvedValueOnce({ rowCount: 1 });

      await service.updateLastActive(externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        'UPDATE user_profiles SET last_active_at = NOW() WHERE external_user_id = $1',
        [externalUserId],
      );
    });

    it('should not throw when user does not exist', async () => {
      mockDatabaseService.query.mockResolvedValueOnce({ rowCount: 0 });

      await expect(
        service.updateLastActive(externalUserId),
      ).resolves.toBeUndefined();
    });

    it('should handle different user IDs', async () => {
      const differentUserId = 'another-user-456';
      mockDatabaseService.query.mockResolvedValueOnce({ rowCount: 1 });

      await service.updateLastActive(differentUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.any(String),
        [differentUserId],
      );
    });

    it('should use parameterized query to prevent SQL injection', async () => {
      const maliciousUserId = "'; DROP TABLE user_profiles; --";
      mockDatabaseService.query.mockResolvedValueOnce({ rowCount: 0 });

      await service.updateLastActive(maliciousUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.any(String),
        [maliciousUserId],
      );
      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).toContain('$1');
      expect(query).not.toContain(maliciousUserId);
    });
  });

  describe('computeAndUpdateProfileEmbedding', () => {
    const externalUserId = 'user-123';

    it('should execute embedding computation query', async () => {
      mockDatabaseService.query.mockResolvedValueOnce({ rowCount: 1 });

      await service.computeAndUpdateProfileEmbedding(externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledTimes(1);
      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.any(String),
        [externalUserId],
      );
    });

    it('should include weighted average calculation in query', async () => {
      mockDatabaseService.query.mockResolvedValueOnce({ rowCount: 1 });

      await service.computeAndUpdateProfileEmbedding(externalUserId);

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).toContain('AVG(t.embedding)');
      expect(query).toContain('vector(256)');
    });

    it('should apply correct weights for event types', async () => {
      mockDatabaseService.query.mockResolvedValueOnce({ rowCount: 1 });

      await service.computeAndUpdateProfileEmbedding(externalUserId);

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).toContain("WHEN i.event_type = 'LIKE' THEN 2.0");
      expect(query).toContain("WHEN i.event_type = 'PLAY' THEN 1.0");
      expect(query).toContain("WHEN i.event_type = 'SKIP' THEN -0.5");
    });

    it('should filter interactions by 90 days window', async () => {
      mockDatabaseService.query.mockResolvedValueOnce({ rowCount: 1 });

      await service.computeAndUpdateProfileEmbedding(externalUserId);

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).toContain("INTERVAL '90 days'");
    });

    it('should limit to 50 most recent interactions', async () => {
      mockDatabaseService.query.mockResolvedValueOnce({ rowCount: 1 });

      await service.computeAndUpdateProfileEmbedding(externalUserId);

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).toContain('LIMIT 50');
    });

    it('should only update if user has interactions', async () => {
      mockDatabaseService.query.mockResolvedValueOnce({ rowCount: 1 });

      await service.computeAndUpdateProfileEmbedding(externalUserId);

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).toContain('EXISTS');
      expect(query).toContain('SELECT 1 FROM interactions');
    });

    it('should filter for relevant event types (LIKE, PLAY, SKIP)', async () => {
      mockDatabaseService.query.mockResolvedValueOnce({ rowCount: 1 });

      await service.computeAndUpdateProfileEmbedding(externalUserId);

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).toContain("('LIKE', 'PLAY', 'SKIP')");
    });

    it('should only use tracks with embeddings', async () => {
      mockDatabaseService.query.mockResolvedValueOnce({ rowCount: 1 });

      await service.computeAndUpdateProfileEmbedding(externalUserId);

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).toContain('t.embedding IS NOT NULL');
    });

    it('should order by created_at DESC', async () => {
      mockDatabaseService.query.mockResolvedValueOnce({ rowCount: 1 });

      await service.computeAndUpdateProfileEmbedding(externalUserId);

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).toContain('ORDER BY i.created_at DESC');
    });

    it('should handle no rows updated gracefully', async () => {
      mockDatabaseService.query.mockResolvedValueOnce({ rowCount: 0 });

      await expect(
        service.computeAndUpdateProfileEmbedding(externalUserId),
      ).resolves.toBeUndefined();
    });
  });

  describe('parseVector (private method via findOrCreateProfile)', () => {
    const externalUserId = 'user-123';

    const testParseVector = async (embedding: any) => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        external_user_id: externalUserId,
        preferred_genres: [],
        disliked_genres: [],
        last_active_at: new Date(),
        profile_embedding: embedding,
      });
      return service.findOrCreateProfile(externalUserId);
    };

    it('should return undefined for null embedding', async () => {
      const result = await testParseVector(null);
      expect(result.profileEmbedding).toBeUndefined();
    });

    it('should return undefined for undefined embedding', async () => {
      const result = await testParseVector(undefined);
      expect(result.profileEmbedding).toBeUndefined();
    });

    it('should parse array of numbers', async () => {
      const result = await testParseVector([1, 2, 3]);
      expect(result.profileEmbedding).toEqual([1, 2, 3]);
    });

    it('should parse array of string numbers', async () => {
      const result = await testParseVector(['1', '2', '3']);
      expect(result.profileEmbedding).toEqual([1, 2, 3]);
    });

    it('should parse string format with brackets', async () => {
      const result = await testParseVector('[1.5,2.5,3.5]');
      expect(result.profileEmbedding).toEqual([1.5, 2.5, 3.5]);
    });

    it('should parse string format without brackets', async () => {
      const result = await testParseVector('1.5,2.5,3.5');
      expect(result.profileEmbedding).toEqual([1.5, 2.5, 3.5]);
    });

    it('should handle scientific notation', async () => {
      const result = await testParseVector('[1e-5, 2.5e3, -3.14e-2]');
      expect(result.profileEmbedding).toEqual([0.00001, 2500, -0.0314]);
    });

    it('should handle negative numbers', async () => {
      const result = await testParseVector('[-1.5, -2.5, -3.5]');
      expect(result.profileEmbedding).toEqual([-1.5, -2.5, -3.5]);
    });

    it('should filter out NaN values', async () => {
      const result = await testParseVector('[1, abc, 3]');
      expect(result.profileEmbedding).toEqual([1, 3]);
    });

    it('should pass through Infinity values from array (no filtering for arrays)', async () => {
      // Note: parseVector only filters invalid values when parsing from strings
      // Array values are mapped directly without filtering
      const result = await testParseVector([1, Infinity, 3]);
      expect(result.profileEmbedding).toEqual([1, Infinity, 3]);
    });

    it('should return undefined for non-string non-array values', async () => {
      const result = await testParseVector({ value: 123 });
      expect(result.profileEmbedding).toBeUndefined();
    });

    it('should return undefined for numeric value', async () => {
      const result = await testParseVector(123);
      expect(result.profileEmbedding).toBeUndefined();
    });

    it('should handle whitespace around brackets', async () => {
      const result = await testParseVector('  [ 1.0 , 2.0 , 3.0 ]  ');
      expect(result.profileEmbedding).toEqual([1.0, 2.0, 3.0]);
    });

    it('should handle large vector dimensions', async () => {
      const largeVector = Array.from({ length: 256 }, (_, i) => i / 256);
      const result = await testParseVector(largeVector);
      expect(result.profileEmbedding).toHaveLength(256);
      expect(result.profileEmbedding![0]).toBeCloseTo(0);
      expect(result.profileEmbedding![255]).toBeCloseTo(255 / 256);
    });
  });

  describe('edge cases and error handling', () => {
    const externalUserId = 'user-123';

    it('should propagate database errors from findOrCreateProfile', async () => {
      const dbError = new Error('Database connection failed');
      mockDatabaseService.queryOne.mockRejectedValueOnce(dbError);

      await expect(service.findOrCreateProfile(externalUserId)).rejects.toThrow(
        'Database connection failed',
      );
    });

    it('should propagate database errors from updatePreferences', async () => {
      const dbError = new Error('Query timeout');
      mockDatabaseService.queryOne.mockRejectedValueOnce(dbError);

      await expect(
        service.updatePreferences(externalUserId, ['rock']),
      ).rejects.toThrow('Query timeout');
    });

    it('should propagate database errors from updateLastActive', async () => {
      const dbError = new Error('Connection pool exhausted');
      mockDatabaseService.query.mockRejectedValueOnce(dbError);

      await expect(service.updateLastActive(externalUserId)).rejects.toThrow(
        'Connection pool exhausted',
      );
    });

    it('should propagate database errors from computeAndUpdateProfileEmbedding', async () => {
      const dbError = new Error('SQL syntax error');
      mockDatabaseService.query.mockRejectedValueOnce(dbError);

      await expect(
        service.computeAndUpdateProfileEmbedding(externalUserId),
      ).rejects.toThrow('SQL syntax error');
    });

    it('should handle very long user IDs', async () => {
      const longUserId = 'a'.repeat(500);
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        external_user_id: longUserId,
        preferred_genres: [],
        disliked_genres: [],
        last_active_at: new Date(),
        profile_embedding: null,
      });

      const result = await service.findOrCreateProfile(longUserId);

      expect(result.externalUserId).toBe(longUserId);
    });

    it('should handle special characters in user ID', async () => {
      const specialUserId = "user-with'quotes\"and\\backslashes";
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        external_user_id: specialUserId,
        preferred_genres: [],
        disliked_genres: [],
        last_active_at: new Date(),
        profile_embedding: null,
      });

      const result = await service.findOrCreateProfile(specialUserId);

      expect(result.externalUserId).toBe(specialUserId);
    });

    it('should handle unicode characters in genre names', async () => {
      const mockProfile = {
        external_user_id: externalUserId,
        preferred_genres: ['ロック', 'ポップ', '電子音楽'],
        disliked_genres: ['カントリー'],
        last_active_at: new Date(),
        profile_embedding: null,
      };
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.findOrCreateProfile(externalUserId);

      expect(result.preferredGenres).toEqual(['ロック', 'ポップ', '電子音楽']);
      expect(result.dislikedGenres).toEqual(['カントリー']);
    });

    it('should handle genres with special characters', async () => {
      const mockProfile = {
        external_user_id: externalUserId,
        preferred_genres: ["rock'n'roll", 'hip-hop', 'R&B'],
        disliked_genres: ['death/black metal'],
        last_active_at: new Date(),
        profile_embedding: null,
      };
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.findOrCreateProfile(externalUserId);

      expect(result.preferredGenres).toEqual(["rock'n'roll", 'hip-hop', 'R&B']);
      expect(result.dislikedGenres).toEqual(['death/black metal']);
    });
  });

  describe('concurrent operations', () => {
    const users = ['user-1', 'user-2', 'user-3'];

    it('should handle multiple concurrent findOrCreateProfile calls', async () => {
      users.forEach((userId, index) => {
        mockDatabaseService.queryOne.mockResolvedValueOnce({
          external_user_id: userId,
          preferred_genres: [`genre-${index}`],
          disliked_genres: [],
          last_active_at: new Date(),
          profile_embedding: null,
        });
      });

      const results = await Promise.all(
        users.map((userId) => service.findOrCreateProfile(userId)),
      );

      expect(results).toHaveLength(3);
      expect(results[0].externalUserId).toBe('user-1');
      expect(results[1].externalUserId).toBe('user-2');
      expect(results[2].externalUserId).toBe('user-3');
    });

    it('should handle multiple concurrent updateLastActive calls', async () => {
      users.forEach(() => {
        mockDatabaseService.query.mockResolvedValueOnce({ rowCount: 1 });
      });

      await Promise.all(
        users.map((userId) => service.updateLastActive(userId)),
      );

      expect(mockDatabaseService.query).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed concurrent operations', async () => {
      // Setup mocks for different operations
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        external_user_id: 'user-1',
        preferred_genres: [],
        disliked_genres: [],
        last_active_at: new Date(),
        profile_embedding: null,
      });
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        external_user_id: 'user-2',
        preferred_genres: ['rock'],
        disliked_genres: [],
        last_active_at: new Date(),
        profile_embedding: null,
      });
      mockDatabaseService.query.mockResolvedValueOnce({ rowCount: 1 });

      const [profile1, profile2] = await Promise.all([
        service.findOrCreateProfile('user-1'),
        service.updatePreferences('user-2', ['rock']),
        service.updateLastActive('user-3'),
      ]);

      expect(profile1.externalUserId).toBe('user-1');
      expect(profile2.preferredGenres).toEqual(['rock']);
    });
  });

  describe('database query construction', () => {
    const externalUserId = 'user-123';

    it('should use parameterized queries in findOrCreateProfile', async () => {
      const maliciousId = "'; DROP TABLE user_profiles; --";
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        external_user_id: maliciousId,
        preferred_genres: [],
        disliked_genres: [],
        last_active_at: new Date(),
        profile_embedding: null,
      });

      await service.findOrCreateProfile(maliciousId);

      const selectQuery = mockDatabaseService.queryOne.mock.calls[0][0];
      expect(selectQuery).toContain('$1');
      expect(selectQuery).not.toContain(maliciousId);
    });

    it('should use parameterized queries in updatePreferences', async () => {
      const maliciousGenre = "rock'; DROP TABLE user_profiles; --";
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        external_user_id: externalUserId,
        preferred_genres: [maliciousGenre],
        disliked_genres: [],
        last_active_at: new Date(),
        profile_embedding: null,
      });

      await service.updatePreferences(externalUserId, [maliciousGenre]);

      const query = mockDatabaseService.queryOne.mock.calls[0][0];
      expect(query).not.toContain(maliciousGenre);
    });

    it('should include RETURNING * in INSERT query', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        external_user_id: externalUserId,
        preferred_genres: [],
        disliked_genres: [],
        last_active_at: new Date(),
        profile_embedding: null,
      });

      await service.findOrCreateProfile(externalUserId);

      const insertQuery = mockDatabaseService.queryOne.mock.calls[1][0];
      expect(insertQuery).toContain('RETURNING *');
    });

    it('should include RETURNING * in UPDATE query', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        external_user_id: externalUserId,
        preferred_genres: ['rock'],
        disliked_genres: [],
        last_active_at: new Date(),
        profile_embedding: null,
      });

      await service.updatePreferences(externalUserId, ['rock']);

      const updateQuery = mockDatabaseService.queryOne.mock.calls[0][0];
      expect(updateQuery).toContain('RETURNING *');
    });
  });
});
