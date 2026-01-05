# Music Recommendation System

A personalized music recommendation system for THE COPY platform, powered by AI and vector similarity search.

## 🎯 Overview

This system provides real-time, personalized music recommendations based on:
- User listening history and interactions
- Context (mood, activity, time of day)
- Vector embeddings for semantic similarity
- Collaborative filtering patterns

### Key Features

- ✅ **Personalized Recommendations**: ML-powered recommendations using pgvector similarity search
- ✅ **Real-time Updates**: WebSocket integration for instant recommendation refreshes on skip detection
- ✅ **Context-Aware**: Recommendations adapt to mood, activity, and time of day
- ✅ **Cold Start Handling**: Smart onboarding and genre-based recommendations for new users
- ✅ **Dual Authentication**: Supports JWT (THE COPY platform) and internal gateway headers
- ✅ **Scalable Architecture**: Monorepo with microservices-ready structure
- ✅ **Performance Optimized**: Redis caching, pgvector HNSW indexing, <300ms response time
- ✅ **Production Readiness**: Automated assessment tool for deployment evaluation

> 📊 **New**: Generate a comprehensive production readiness report with `npm run production-report`. See [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md) for details.

## 🏗️ Architecture

### Monorepo Structure

```
music-recommendation-system/
├── apps/
│   ├── web/           # Next.js 14 frontend (App Router)
│   ├── api/           # NestJS backend (REST + WebSocket)
│   └── ml/            # Python FastAPI (optional, for future ML features)
├── packages/
│   └── shared/        # Shared TypeScript types and Zod schemas
├── docker-compose.yml # Development environment
└── turbo.json         # Turborepo configuration
```

### Technology Stack

#### Frontend
- **Next.js 14** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **Socket.IO Client** for real-time updates
- **Zod** for runtime validation

#### Backend
- **NestJS** (TypeScript framework)
- **PostgreSQL** with **pgvector** extension
- **Redis** for caching and rate limiting
- **Socket.IO** for WebSocket communication
- **Swagger/OpenAPI** for API documentation

#### Infrastructure
- **Docker Compose** for local development
- **Turborepo** for monorepo management
- **GitHub Actions** for CI/CD (optional)

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **Docker** and **Docker Compose**

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd music-recommendation-system
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your configuration (defaults work for local development).

4. **Start the development environment**
   ```bash
   npm run docker:up
   ```

   This will start:
   - PostgreSQL with pgvector (port 5432)
   - Redis (port 6379)
   - API (port 3001)
   - Web (port 3000)

5. **Run database migrations**
   ```bash
   npm run db:migrate
   ```

6. **Seed the database with test data**
   ```bash
   npm run db:seed
   ```

   This creates 500 tracks with embeddings and 3 test user profiles.

7. **Access the application**
   - **Frontend**: http://localhost:3000
   - **API Documentation**: http://localhost:3001/api/docs
   - **Health Check**: http://localhost:3001/health

## 📚 API Endpoints

### Authentication
All endpoints require authentication via:
- **Method A**: `Authorization: Bearer <JWT>` from THE COPY platform
- **Method B**: `X-TheCopy-UserId` header (internal gateway only)
- **Development**: Automatic bypass with `DEV_USER_ID` environment variable

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/me` | Get user profile |
| PUT | `/me/preferences` | Update user preferences (onboarding) |
| GET | `/recommendations` | Get personalized recommendations |
| POST | `/interactions` | Record user interaction (play/skip/like/dislike) |
| GET | `/playlists` | Get user's playlists |
| POST | `/playlists` | Create new playlist |
| GET | `/playlists/:id` | Get playlist with tracks |
| PUT | `/playlists/:id` | Update playlist |
| DELETE | `/playlists/:id` | Delete playlist |
| POST | `/playlists/:id/tracks` | Add track to playlist |
| DELETE | `/playlists/:id/tracks/:trackId` | Remove track from playlist |

### WebSocket Events

**Namespace**: `/recommendations`

**Events**:
- `connect` - Client connects with `userId` query parameter
- `recommendations:update` - Server sends updated recommendations
- `request-refresh` - Client requests manual refresh
- `ping/pong` - Heartbeat

## 🎨 Frontend Features

### Components

1. **MusicPlayer**: Interactive player with play/pause, like, dislike, skip, and add to playlist
2. **ContextSelector**: UI for selecting mood and activity
3. **OnboardingModal**: Genre preference selection for new users
4. **WebSocketProvider**: Real-time connection management

### Real-time Updates

The system automatically refreshes recommendations when:
- User skips 2+ tracks within 60 seconds
- User changes context (mood/activity)
- Manual refresh is requested

## 🔐 Authentication & Security

### THE COPY Platform Integration

The system is designed as a plugin for THE COPY platform and does not have its own login system.

#### Method A: JWT Bearer Token

```typescript
// Frontend sends
Authorization: Bearer <THE_COPY_JWT>

// Backend verifies
- JWKS URL for public key
- Issuer and audience claims
- Token expiration
- Extracts external_user_id from sub claim
```

#### Method B: Internal Gateway Header

```typescript
// Frontend (behind THE COPY gateway)
X-TheCopy-UserId: <user-id>

// Backend verifies
- Request comes from trusted proxy/gateway
- Optional: IP whitelist or reverse proxy header check
```

#### Development Mode

```bash
# In .env
DEV_USER_ID=dev-user-123
NODE_ENV=development
```

In development mode, authentication is bypassed and the DEV_USER_ID is used.

### Security Measures

- ✅ JWT verification with JWKS key rotation
- ✅ Request validation with Zod schemas
- ✅ Rate limiting (Redis-based)
- ✅ CORS configuration
- ✅ SQL injection prevention (parameterized queries)
- ✅ XSS prevention (input sanitization)
- ✅ Correlation IDs for request tracing

## 🧠 Recommendation Algorithm

### Pipeline

1. **User Profile Analysis**
   - Compute user embedding from recent interactions
   - Weight: LIKE (2.0), PLAY (1.0), SKIP (-0.5)
   - Consider last 50 interactions within 90 days

2. **Candidate Generation**
   - **Existing Users**: pgvector cosine similarity search on track embeddings
   - **New Users**: Popular tracks filtered by preferred genres

3. **Filtering**
   - Exclude recently skipped tracks (last 24 hours)
   - Apply disliked genres filter

4. **Context-based Ranking**
   - **EXERCISE** → Higher energy and tempo
   - **RELAX** → Lower energy, higher acousticness
   - **PARTY** → Higher danceability
   - **CALM mood** → Lower energy
   - **ENERGETIC mood** → Higher energy
   - **HAPPY mood** → Higher valence
   - **SAD mood** → Lower valence

5. **Diversity Rules**
   - Maximum 3 consecutive tracks from same artist
   - Genre distribution balancing

6. **Caching**
   - Redis cache with 5-minute TTL
   - Invalidated on context change or skip detection

### Performance

- **Target**: <300ms response time (warm cache)
- **HNSW Index**: O(log n) similarity search
- **Materialized View**: Pre-computed popular tracks

## 📊 Database Schema

### Core Tables

```sql
-- Tracks
tracks (
  id UUID PRIMARY KEY,
  title VARCHAR(500),
  artist VARCHAR(500),
  genre VARCHAR(100),
  embedding vector(256),  -- pgvector
  audio_features JSONB,
  ...
)

-- User Profiles (keyed by external_user_id)
user_profiles (
  external_user_id VARCHAR(255) PRIMARY KEY,
  preferred_genres TEXT[],
  disliked_genres TEXT[],
  profile_embedding vector(256),
  ...
)

-- Interactions
interactions (
  id UUID PRIMARY KEY,
  external_user_id VARCHAR(255),
  track_id UUID,
  event_type ENUM('PLAY', 'SKIP', 'LIKE', 'DISLIKE', 'ADD_TO_PLAYLIST'),
  context JSONB,
  created_at TIMESTAMP
)

-- Playlists
playlists (...)
playlist_tracks (...)
```

### Indexes

- **HNSW** index on `tracks.embedding` for fast similarity search
- **B-tree** indexes on `external_user_id`, `created_at`, `genre`, `artist`
- **Composite** index on `(external_user_id, event_type, created_at)` for skip detection

### Materialized View

```sql
CREATE MATERIALIZED VIEW popular_tracks AS
SELECT tracks.*, COUNT(interactions.*) as popularity_score
FROM tracks LEFT JOIN interactions
WHERE event_type IN ('PLAY', 'LIKE')
GROUP BY tracks.id;
```

Refreshed periodically or on-demand.

## 🔧 Configuration

### Environment Variables

#### API (apps/api/.env)

```bash
# Database
DATABASE_URL=postgresql://music_user:music_pass_dev@localhost:5432/music_rec

# Redis
REDIS_URL=redis://localhost:6379

# JWT Configuration
JWT_SECRET=your_secret_here
JWKS_URI=https://thecopy.platform/auth/.well-known/jwks.json
JWT_ISSUER=the-copy-platform
JWT_AUDIENCE=music-recommendation

# Development
DEV_USER_ID=dev-user-123
NODE_ENV=development

# CORS
CORS_ORIGIN=http://localhost:3000
```

#### Web (apps/web/.env.local)

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

## 📈 Performance Optimization

### Database
- pgvector HNSW indexing for O(log n) similarity search
- Materialized views for popular tracks
- Connection pooling (max 20 connections)

### Caching
- Redis caching for recommendations (5min TTL)
- Cache invalidation on context change and skip detection

### API
- Request validation with Zod (early failure)
- Correlation IDs for distributed tracing
- Structured logging

### Frontend
- Next.js App Router with server components
- WebSocket connection pooling
- Optimistic UI updates

## 🧪 Testing

### Unit Tests

```bash
# Run all tests
npm test

# Run API tests
cd apps/api && npm test

# Run with coverage
npm run test:cov
```

### Integration Tests

```bash
npm run test:e2e
```

### Manual Testing

1. Start the development environment
2. Visit http://localhost:3000
3. Complete onboarding (select genres)
4. Interact with recommendations (play, like, skip)
5. Verify WebSocket updates on rapid skips

## 🚢 Deployment

### Production Checklist

- [ ] Set production environment variables
- [ ] Configure JWKS_URI for THE COPY platform
- [ ] Enable SSL/TLS
- [ ] Set up Redis persistence
- [ ] Configure database backups
- [ ] Set up monitoring (health checks, metrics)
- [ ] Configure rate limiting
- [ ] Review CORS origins
- [ ] Set up logging aggregation
- [ ] Configure secrets management

### Docker Production Build

```bash
docker-compose -f docker-compose.prod.yml up -d
```

## 🔮 Future Enhancements

### Not Implemented in MVP (Documented for Future)

1. **Advanced ML Features**
   - Real audio feature extraction (Spotify API or Librosa)
   - Transformer-based embeddings
   - A/B testing framework

2. **Scalability**
   - Kafka for event streaming
   - Feature store for ML features
   - Separate ML service (FastAPI in `apps/ml`)

3. **Graph Database**
   - Neo4j for social recommendations
   - Collaborative filtering
   - User similarity networks

4. **Analytics**
   - User behavior tracking
   - Recommendation performance metrics
   - A/B test analysis

5. **Enhanced Features**
   - Playlist generation
   - Radio mode
   - Social sharing
   - Offline mode

## 🛠️ Development Commands

```bash
# Install dependencies
npm install

# Start development
npm run dev

# Build all apps
npm run build

# Lint
npm run lint

# Format code
npm run format

# Clean build artifacts
npm run clean

# Docker commands
npm run docker:up      # Start services
npm run docker:down    # Stop services
npm run docker:logs    # View logs

# Database
npm run db:migrate     # Run migrations
npm run db:seed        # Seed data

# Production Readiness
npm run production-report  # Generate production readiness assessment
```

## 📝 Design Decisions

### Why Monorepo?
- Shared types and schemas between frontend and backend
- Easier dependency management
- Consistent tooling across projects

### Why pgvector?
- Native PostgreSQL extension (no additional DB)
- HNSW indexing for fast similarity search
- Mature and well-supported

### Why NestJS?
- TypeScript-first framework
- Built-in WebSocket support
- Excellent architecture for scalable APIs
- Strong ecosystem

### Why Next.js App Router?
- Server components for performance
- Built-in API routes
- File-based routing
- Great developer experience

### Why Redis?
- Fast caching layer
- Pub/sub for real-time features
- Rate limiting support
- Session management

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is proprietary software for THE COPY platform.

## 🙏 Acknowledgments

- THE COPY platform team
- pgvector community
- NestJS and Next.js teams

---

**Built with ❤️ for THE COPY platform**
