#!/usr/bin/env node

const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://music_user:music_pass_dev@localhost:5432/music_rec';

const pool = new Pool({ connectionString });

const genres = [
  'Pop', 'Rock', 'Hip Hop', 'Electronic', 'Jazz', 'Classical',
  'R&B', 'Country', 'Indie', 'Metal', 'Reggae', 'Blues',
  'Folk', 'Latin', 'K-Pop', 'Funk', 'Soul', 'Ambient'
];

const adjectives = [
  'Beautiful', 'Electric', 'Midnight', 'Summer', 'Golden', 'Lost',
  'Wild', 'Broken', 'Sweet', 'Dark', 'Neon', 'Velvet',
  'Crystal', 'Digital', 'Cosmic', 'Urban', 'Silent', 'Eternal'
];

const nouns = [
  'Dreams', 'Nights', 'Hearts', 'City', 'Love', 'Rain',
  'Stars', 'Melody', 'Soul', 'Fire', 'Ocean', 'Sky',
  'Paradise', 'Journey', 'Memories', 'Thunder', 'Echo', 'Sunrise'
];

const artistPrefixes = ['The', 'DJ', 'MC', 'Lil'];
const artistNames = [
  'Phoenix', 'Nova', 'Echo', 'Storm', 'Wave', 'Pulse',
  'Shadow', 'Luna', 'Zen', 'Vibe', 'Flow', 'Soul',
  'Blaze', 'Frost', 'Spark', 'Drift', 'Vapor', 'Rhythm'
];

function randomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateTrackTitle() {
  if (Math.random() > 0.5) {
    return `${randomElement(adjectives)} ${randomElement(nouns)}`;
  }
  return randomElement(nouns);
}

function generateArtistName() {
  if (Math.random() > 0.7) {
    return `${randomElement(artistPrefixes)} ${randomElement(artistNames)}`;
  }
  return randomElement(artistNames);
}

function generateEmbedding() {
  // Generate a 256-dimensional embedding with normalized values
  const embedding = [];
  for (let i = 0; i < 256; i++) {
    embedding.push(randomFloat(-1, 1));
  }

  // Normalize to unit length (for cosine similarity)
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => val / magnitude);
}

function generateAudioFeatures(genre) {
  // Generate realistic audio features based on genre
  const features = {
    energy: randomFloat(0, 1),
    valence: randomFloat(0, 1),
    danceability: randomFloat(0, 1),
    tempo: randomFloat(60, 180),
    loudness: randomFloat(-60, 0),
    speechiness: randomFloat(0, 0.5),
    acousticness: randomFloat(0, 1),
    instrumentalness: randomFloat(0, 1),
    liveness: randomFloat(0, 0.4),
    key: randomInt(0, 11),
    mode: randomInt(0, 1),
    timeSignature: randomElement([3, 4, 5, 6, 7])
  };

  // Adjust based on genre
  switch (genre) {
    case 'Electronic':
    case 'Hip Hop':
      features.energy = randomFloat(0.6, 1);
      features.danceability = randomFloat(0.6, 1);
      features.acousticness = randomFloat(0, 0.3);
      break;
    case 'Classical':
    case 'Ambient':
      features.energy = randomFloat(0, 0.5);
      features.instrumentalness = randomFloat(0.7, 1);
      features.acousticness = randomFloat(0.5, 1);
      break;
    case 'Rock':
    case 'Metal':
      features.energy = randomFloat(0.7, 1);
      features.loudness = randomFloat(-10, 0);
      break;
    case 'Jazz':
    case 'Blues':
      features.acousticness = randomFloat(0.4, 0.9);
      features.instrumentalness = randomFloat(0.3, 0.8);
      break;
  }

  return features;
}

async function seed() {
  const client = await pool.connect();

  try {
    console.log('🌱 Starting database seeding...');

    // Start transaction
    await client.query('BEGIN');

    // Clear existing data (for development)
    console.log('🧹 Clearing existing data...');
    await client.query('DELETE FROM playlist_tracks');
    await client.query('DELETE FROM playlists');
    await client.query('DELETE FROM interactions');
    await client.query('DELETE FROM tracks');
    await client.query('DELETE FROM user_profiles');

    console.log('📀 Generating 500 tracks...');

    const tracks = [];
    const usedTitles = new Set();

    for (let i = 0; i < 500; i++) {
      let title = generateTrackTitle();

      // Ensure unique titles
      while (usedTitles.has(title)) {
        title = generateTrackTitle() + ` ${randomInt(1, 99)}`;
      }
      usedTitles.add(title);

      const artist = generateArtistName();
      const genre = randomElement(genres);
      const album = Math.random() > 0.3 ? `${randomElement(adjectives)} ${randomElement(nouns)} Album` : null;
      const durationSec = randomInt(120, 360);
      const externalUrl = `https://example.com/track/${i + 1}`;
      const previewUrl = Math.random() > 0.3 ? `https://example.com/preview/${i + 1}.mp3` : null;
      const audioFeatures = generateAudioFeatures(genre);
      const embedding = generateEmbedding();

      const result = await client.query(
        `INSERT INTO tracks (title, artist, album, genre, duration_sec, external_url, preview_url, audio_features, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          title,
          artist,
          album,
          genre,
          durationSec,
          externalUrl,
          previewUrl,
          JSON.stringify(audioFeatures),
          `[${embedding.join(',')}]`
        ]
      );

      tracks.push(result.rows[0].id);

      if ((i + 1) % 50 === 0) {
        console.log(`  ✓ Generated ${i + 1}/500 tracks`);
      }
    }

    console.log('✅ Successfully generated 500 tracks');

    // Refresh materialized view for popular tracks
    console.log('🔄 Refreshing popular_tracks view...');
    await client.query('REFRESH MATERIALIZED VIEW popular_tracks');

    // Create a few test user profiles
    console.log('👤 Creating test user profiles...');
    await client.query(
      `INSERT INTO user_profiles (external_user_id, preferred_genres, disliked_genres)
       VALUES
         ('test-user-1', ARRAY['Pop', 'Electronic'], ARRAY['Metal']),
         ('test-user-2', ARRAY['Rock', 'Indie'], ARRAY['Country']),
         ('test-user-3', ARRAY['Hip Hop', 'R&B'], ARRAY[])
      `
    );

    // Commit transaction
    await client.query('COMMIT');

    console.log('');
    console.log('🎉 Database seeding completed successfully!');
    console.log('');
    console.log('📊 Summary:');
    console.log(`  - Tracks: 500`);
    console.log(`  - Genres: ${genres.length}`);
    console.log(`  - Test users: 3`);
    console.log('');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
