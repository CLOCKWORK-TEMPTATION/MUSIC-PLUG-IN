import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { DatabaseService } from '../config/database.service';

describe('UsersService', () => {
  let service: UsersService;

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
      preferred_genres: ['rock', 'jazz'],
      disliked_genres: ['country'],
      last_active_at: new Date('2024-01-15T10:00:00Z'),
      profile_embedding: [0.1, 0.2, 0.3],
      ...overrides,
    });

    it('should return existing profile when found', async () => {
      const mockProfile = createMockDbProfile();
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.findOrCreateProfile(externalUserId);

      expect(result).toEqual({
        externalUserId,
        preferredGenres: ['rock', 'jazz'],
        dislikedGenres: ['country'],
        lastActiveAt: new Date('2024-01-15T10:00:00Z'),
        profileEmbedding: [0.1, 0.2, 0.3],
      });
      expect(mockDatabaseService.queryOne).toHaveBeenCalledTimes(1);
      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        'SELECT * FROM user_profiles WHERE external_user_id = $1',
        [externalUserId],
      );
    });

    it('should create new profile when not found', async () => {
      const newProfile = createMockDbProfile({
        preferred_genres: [],
        disliked_genres: [],
        profile_embedding: undefined,
      });

      mockDatabaseService.queryOne
        .mockResolvedValueOnce(null) // First call: SELECT returns null
        .mockResolvedValueOnce(newProfile); // Second call: INSERT returns new profile

      const result = await service.findOrCreateProfile(externalUserId);

      expect(result).toEqual({
        externalUserId,
        preferredGenres: [],
        dislikedGenres: [],
        lastActiveAt: expect.any(Date),
      });
      expect(mockDatabaseService.queryOne).toHaveBeenCalledTimes(2);
      expect(mockDatabaseService.queryOne).toHaveBeenLastCalledWith(
        expect.stringContaining('INSERT INTO user_profiles'),
        [externalUserId, [], []],
      );
    });

    it('should handle null preferred_genres from database', async () => {
      const mockProfile = createMockDbProfile({
        preferred_genres: null,
        disliked_genres: null,
      });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.findOrCreateProfile(externalUserId);

      expect(result.preferredGenres).toEqual([]);
      expect(result.dislikedGenres).toEqual([]);
    });

    it('should handle profile without embedding', async () => {
      const mockProfile = createMockDbProfile({
        profile_embedding: undefined,
      });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.findOrCreateProfile(externalUserId);

      expect(result.profileEmbedding).toBeUndefined();
    });

    it('should query with correct SQL for SELECT', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(createMockDbProfile());

      await service.findOrCreateProfile(externalUserId);

      const selectQuery = mockDatabaseService.queryOne.mock.calls[0][0];
      expect(selectQuery).toContain('SELECT');
      expect(selectQuery).toContain('FROM user_profiles');
      expect(selectQuery).toContain('WHERE external_user_id = $1');
    });

    it('should use RETURNING * in INSERT query', async () => {
      mockDatabaseService.queryOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(createMockDbProfile());

      await service.findOrCreateProfile(externalUserId);

      const insertQuery = mockDatabaseService.queryOne.mock.calls[1][0];
      expect(insertQuery).toContain('INSERT INTO user_profiles');
      expect(insertQuery).toContain('RETURNING *');
    });

    it('should handle special characters in user ID', async () => {
      const specialUserId = "user-with'quotes\"and\\backslashes";
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        external_user_id: specialUserId,
        preferred_genres: [],
        disliked_genres: [],
        last_active_at: new Date(),
      });

      const result = await service.findOrCreateProfile(specialUserId);

      expect(result.externalUserId).toBe(specialUserId);
      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        expect.any(String),
        [specialUserId],
      );
    });

    it('should propagate database errors', async () => {
      const dbError = new Error('Database connection failed');
      mockDatabaseService.queryOne.mockRejectedValueOnce(dbError);

      await expect(service.findOrCreateProfile(externalUserId)).rejects.toThrow(
        'Database connection failed',
      );
    });
  });

  describe('updatePreferences', () => {
    const externalUserId = 'user-123';

    const createMockDbProfile = (overrides = {}) => ({
      external_user_id: externalUserId,
      preferred_genres: ['rock', 'jazz'],
      disliked_genres: ['country'],
      last_active_at: new Date('2024-01-15T10:00:00Z'),
      profile_embedding: [0.1, 0.2, 0.3],
      ...overrides,
    });

    it('should update preferred genres only', async () => {
      const mockProfile = createMockDbProfile({
        preferred_genres: ['pop', 'electronic'],
      });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.updatePreferences(externalUserId, ['pop', 'electronic']);

      expect(result.preferredGenres).toEqual(['pop', 'electronic']);
      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('preferred_genres = $1'),
        [['pop', 'electronic'], externalUserId],
      );
    });

    it('should update disliked genres only', async () => {
      const mockProfile = createMockDbProfile({
        disliked_genres: ['metal', 'classical'],
      });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.updatePreferences(
        externalUserId,
        undefined,
        ['metal', 'classical'],
      );

      expect(result.dislikedGenres).toEqual(['metal', 'classical']);
      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('disliked_genres = $1'),
        [['metal', 'classical'], externalUserId],
      );
    });

    it('should update both preferred and disliked genres', async () => {
      const mockProfile = createMockDbProfile({
        preferred_genres: ['indie', 'folk'],
        disliked_genres: ['rap'],
      });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.updatePreferences(
        externalUserId,
        ['indie', 'folk'],
        ['rap'],
      );

      expect(result.preferredGenres).toEqual(['indie', 'folk']);
      expect(result.dislikedGenres).toEqual(['rap']);
      expect(mockDatabaseService.queryOne).toHaveBeenCalledWith(
        expect.stringContaining('preferred_genres = $1'),
        [['indie', 'folk'], ['rap'], externalUserId],
      );
    });

    it('should always update last_active_at', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(createMockDbProfile());

      await service.updatePreferences(externalUserId, ['rock']);

      const query = mockDatabaseService.queryOne.mock.calls[0][0];
      expect(query).toContain('last_active_at = NOW()');
    });

    it('should use RETURNING * in UPDATE query', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(createMockDbProfile());

      await service.updatePreferences(externalUserId, ['rock']);

      const query = mockDatabaseService.queryOne.mock.calls[0][0];
      expect(query).toContain('RETURNING *');
    });

    it('should create profile if UPDATE returns null', async () => {
      const newProfile = createMockDbProfile({
        preferred_genres: [],
        disliked_genres: [],
      });

      mockDatabaseService.queryOne
        .mockResolvedValueOnce(null) // UPDATE returns null (profile doesn't exist)
        .mockResolvedValueOnce(null) // findOrCreateProfile SELECT returns null
        .mockResolvedValueOnce(newProfile); // findOrCreateProfile INSERT

      const result = await service.updatePreferences(externalUserId, ['rock']);

      // Should have called findOrCreateProfile which makes 2 more queries
      expect(mockDatabaseService.queryOne).toHaveBeenCalledTimes(3);
    });

    it('should handle null genres from database', async () => {
      const mockProfile = createMockDbProfile({
        preferred_genres: null,
        disliked_genres: null,
      });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.updatePreferences(externalUserId, ['rock']);

      expect(result.preferredGenres).toEqual([]);
      expect(result.dislikedGenres).toEqual([]);
    });

    it('should return profileEmbedding when present', async () => {
      const mockProfile = createMockDbProfile({
        profile_embedding: [0.5, 0.6, 0.7],
      });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.updatePreferences(externalUserId, ['rock']);

      expect(result.profileEmbedding).toEqual([0.5, 0.6, 0.7]);
    });

    it('should handle empty genre arrays', async () => {
      const mockProfile = createMockDbProfile({
        preferred_genres: [],
        disliked_genres: [],
      });
      mockDatabaseService.queryOne.mockResolvedValueOnce(mockProfile);

      const result = await service.updatePreferences(externalUserId, [], []);

      expect(result.preferredGenres).toEqual([]);
      expect(result.dislikedGenres).toEqual([]);
    });

    it('should build correct parameterized query for preferred only', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(createMockDbProfile());

      await service.updatePreferences(externalUserId, ['rock', 'jazz']);

      const [query, params] = mockDatabaseService.queryOne.mock.calls[0];
      expect(query).toContain('preferred_genres = $1');
      expect(query).toContain('WHERE external_user_id = $2');
      expect(params).toEqual([['rock', 'jazz'], externalUserId]);
    });

    it('should build correct parameterized query for disliked only', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(createMockDbProfile());

      await service.updatePreferences(externalUserId, undefined, ['country']);

      const [query, params] = mockDatabaseService.queryOne.mock.calls[0];
      expect(query).toContain('disliked_genres = $1');
      expect(query).toContain('WHERE external_user_id = $2');
      expect(params).toEqual([['country'], externalUserId]);
    });

    it('should build correct parameterized query for both genres', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(createMockDbProfile());

      await service.updatePreferences(externalUserId, ['rock'], ['country']);

      const [query, params] = mockDatabaseService.queryOne.mock.calls[0];
      expect(query).toContain('preferred_genres = $1');
      expect(query).toContain('disliked_genres = $2');
      expect(query).toContain('WHERE external_user_id = $3');
      expect(params).toEqual([['rock'], ['country'], externalUserId]);
    });

    it('should propagate database errors', async () => {
      const dbError = new Error('Update failed');
      mockDatabaseService.queryOne.mockRejectedValueOnce(dbError);

      await expect(
        service.updatePreferences(externalUserId, ['rock']),
      ).rejects.toThrow('Update failed');
    });
  });

  describe('updateLastActive', () => {
    const externalUserId = 'user-123';

    it('should update last_active_at for the user', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.updateLastActive(externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        'UPDATE user_profiles SET last_active_at = NOW() WHERE external_user_id = $1',
        [externalUserId],
      );
    });

    it('should not throw if user does not exist', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await expect(service.updateLastActive(externalUserId)).resolves.not.toThrow();
    });

    it('should propagate database errors', async () => {
      const dbError = new Error('Connection lost');
      mockDatabaseService.query.mockRejectedValueOnce(dbError);

      await expect(service.updateLastActive(externalUserId)).rejects.toThrow(
        'Connection lost',
      );
    });

    it('should use parameterized query', async () => {
      const specialUserId = "user'; DROP TABLE user_profiles; --";
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.updateLastActive(specialUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('$1'),
        [specialUserId],
      );

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).not.toContain(specialUserId);
    });
  });

  describe('computeAndUpdateProfileEmbedding', () => {
    const externalUserId = 'user-123';

    it('should execute the embedding update query', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.computeAndUpdateProfileEmbedding(externalUserId);

      expect(mockDatabaseService.query).toHaveBeenCalledTimes(1);
      expect(mockDatabaseService.query).toHaveBeenCalledWith(
        expect.any(String),
        [externalUserId],
      );
    });

    it('should include LIKE weight of 2.0 in query', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.computeAndUpdateProfileEmbedding(externalUserId);

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).toContain("WHEN i.event_type = 'LIKE' THEN 2.0");
    });

    it('should include PLAY weight of 1.0 in query', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.computeAndUpdateProfileEmbedding(externalUserId);

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).toContain("WHEN i.event_type = 'PLAY' THEN 1.0");
    });

    it('should include SKIP weight of -0.5 in query', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.computeAndUpdateProfileEmbedding(externalUserId);

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).toContain("WHEN i.event_type = 'SKIP' THEN -0.5");
    });

    it('should limit to last 50 interactions', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.computeAndUpdateProfileEmbedding(externalUserId);

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).toContain('LIMIT 50');
    });

    it('should filter to last 90 days', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.computeAndUpdateProfileEmbedding(externalUserId);

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).toContain("INTERVAL '90 days'");
    });

    it('should only consider LIKE, PLAY, and SKIP events', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.computeAndUpdateProfileEmbedding(externalUserId);

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).toContain("i.event_type IN ('LIKE', 'PLAY', 'SKIP')");
    });

    it('should join with tracks table', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.computeAndUpdateProfileEmbedding(externalUserId);

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).toContain('JOIN tracks t ON t.id = recent_interactions.track_id');
    });

    it('should filter out tracks without embeddings', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.computeAndUpdateProfileEmbedding(externalUserId);

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).toContain('WHERE t.embedding IS NOT NULL');
    });

    it('should check for existence of interactions before updating', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.computeAndUpdateProfileEmbedding(externalUserId);

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).toContain('EXISTS');
      expect(query).toContain('SELECT 1 FROM interactions i');
    });

    it('should use vector type for embedding', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.computeAndUpdateProfileEmbedding(externalUserId);

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).toContain('::vector(256)');
    });

    it('should order interactions by created_at DESC', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.computeAndUpdateProfileEmbedding(externalUserId);

      const query = mockDatabaseService.query.mock.calls[0][0];
      expect(query).toContain('ORDER BY i.created_at DESC');
    });

    it('should propagate database errors', async () => {
      const dbError = new Error('Embedding computation failed');
      mockDatabaseService.query.mockRejectedValueOnce(dbError);

      await expect(
        service.computeAndUpdateProfileEmbedding(externalUserId),
      ).rejects.toThrow('Embedding computation failed');
    });

    it('should use parameterized query for user ID', async () => {
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.computeAndUpdateProfileEmbedding(externalUserId);

      const [query, params] = mockDatabaseService.query.mock.calls[0];
      expect(params).toEqual([externalUserId]);
      // User ID should appear as $1 in multiple places
      expect(query.match(/\$1/g)?.length).toBeGreaterThan(1);
    });

    it('should complete without error when no interactions exist', async () => {
      // The EXISTS check will return false, but query still executes successfully
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await expect(
        service.computeAndUpdateProfileEmbedding(externalUserId),
      ).resolves.not.toThrow();
    });
  });

  describe('integration scenarios', () => {
    const externalUserId = 'user-123';

    it('should handle new user onboarding flow', async () => {
      // Step 1: User profile doesn't exist
      mockDatabaseService.queryOne
        .mockResolvedValueOnce(null) // findOrCreateProfile SELECT
        .mockResolvedValueOnce({
          external_user_id: externalUserId,
          preferred_genres: [],
          disliked_genres: [],
          last_active_at: new Date(),
        }); // findOrCreateProfile INSERT

      // Create profile
      const newProfile = await service.findOrCreateProfile(externalUserId);
      expect(newProfile.preferredGenres).toEqual([]);

      // Step 2: Update with preferences during onboarding
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        external_user_id: externalUserId,
        preferred_genres: ['rock', 'indie'],
        disliked_genres: [],
        last_active_at: new Date(),
      });

      const updatedProfile = await service.updatePreferences(
        externalUserId,
        ['rock', 'indie'],
      );
      expect(updatedProfile.preferredGenres).toEqual(['rock', 'indie']);
    });

    it('should handle returning user flow', async () => {
      // Existing user profile
      const existingProfile = {
        external_user_id: externalUserId,
        preferred_genres: ['rock'],
        disliked_genres: ['country'],
        last_active_at: new Date('2024-01-01'),
        profile_embedding: Array(256).fill(0.1),
      };

      mockDatabaseService.queryOne.mockResolvedValueOnce(existingProfile);

      const profile = await service.findOrCreateProfile(externalUserId);

      expect(profile.preferredGenres).toEqual(['rock']);
      expect(profile.profileEmbedding).toHaveLength(256);
      // Should NOT have called INSERT
      expect(mockDatabaseService.queryOne).toHaveBeenCalledTimes(1);
    });

    it('should handle preference update followed by embedding computation', async () => {
      // Update preferences
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        external_user_id: externalUserId,
        preferred_genres: ['electronic', 'ambient'],
        disliked_genres: [],
        last_active_at: new Date(),
      });

      await service.updatePreferences(externalUserId, ['electronic', 'ambient']);

      // Compute embedding
      mockDatabaseService.query.mockResolvedValueOnce([]);

      await service.computeAndUpdateProfileEmbedding(externalUserId);

      expect(mockDatabaseService.queryOne).toHaveBeenCalledTimes(1);
      expect(mockDatabaseService.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('should handle very long genre names', async () => {
      const longGenreName = 'a'.repeat(500);
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        external_user_id: 'user-123',
        preferred_genres: [longGenreName],
        disliked_genres: [],
        last_active_at: new Date(),
      });

      const result = await service.updatePreferences('user-123', [longGenreName]);

      expect(result.preferredGenres[0]).toBe(longGenreName);
    });

    it('should handle many genres', async () => {
      const manyGenres = Array.from({ length: 100 }, (_, i) => `genre-${i}`);
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        external_user_id: 'user-123',
        preferred_genres: manyGenres,
        disliked_genres: [],
        last_active_at: new Date(),
      });

      const result = await service.updatePreferences('user-123', manyGenres);

      expect(result.preferredGenres).toHaveLength(100);
    });

    it('should handle unicode genre names', async () => {
      const unicodeGenres = ['日本語', '한국어', 'العربية', '🎵🎶'];
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        external_user_id: 'user-123',
        preferred_genres: unicodeGenres,
        disliked_genres: [],
        last_active_at: new Date(),
      });

      const result = await service.updatePreferences('user-123', unicodeGenres);

      expect(result.preferredGenres).toEqual(unicodeGenres);
    });

    it('should handle empty user ID gracefully', async () => {
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        external_user_id: '',
        preferred_genres: [],
        disliked_genres: [],
        last_active_at: new Date(),
      });

      const result = await service.findOrCreateProfile('');

      expect(result.externalUserId).toBe('');
    });

    it('should handle concurrent findOrCreateProfile calls', async () => {
      const existingProfile = {
        external_user_id: 'user-123',
        preferred_genres: ['rock'],
        disliked_genres: [],
        last_active_at: new Date(),
      };

      mockDatabaseService.queryOne.mockResolvedValue(existingProfile);

      const results = await Promise.all([
        service.findOrCreateProfile('user-123'),
        service.findOrCreateProfile('user-123'),
        service.findOrCreateProfile('user-123'),
      ]);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.externalUserId).toBe('user-123');
      });
    });
  });

  describe('SQL injection prevention', () => {
    it('should safely handle malicious user ID in findOrCreateProfile', async () => {
      const maliciousId = "'; DROP TABLE user_profiles; --";
      mockDatabaseService.queryOne.mockResolvedValueOnce(null);
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        external_user_id: maliciousId,
        preferred_genres: [],
        disliked_genres: [],
        last_active_at: new Date(),
      });

      await service.findOrCreateProfile(maliciousId);

      // Should use parameterized query, not string interpolation
      const selectCall = mockDatabaseService.queryOne.mock.calls[0];
      expect(selectCall[0]).not.toContain(maliciousId);
      expect(selectCall[1]).toContain(maliciousId);
    });

    it('should safely handle malicious genre names', async () => {
      const maliciousGenre = "rock'; DROP TABLE tracks; --";
      mockDatabaseService.queryOne.mockResolvedValueOnce({
        external_user_id: 'user-123',
        preferred_genres: [maliciousGenre],
        disliked_genres: [],
        last_active_at: new Date(),
      });

      await service.updatePreferences('user-123', [maliciousGenre]);

      const updateCall = mockDatabaseService.queryOne.mock.calls[0];
      expect(updateCall[0]).not.toContain(maliciousGenre);
      expect(updateCall[1]).toContainEqual([maliciousGenre]);
    });
  });
});
