const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function fetchAPI<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_URL}${endpoint}`;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // In production, this would come from THE COPY platform
  // For development, we rely on DEV_USER_ID in the API
  const devMode = process.env.NODE_ENV === 'development';
  if (devMode) {
    // The API will use DEV_USER_ID from env in development mode
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({
      message: response.statusText,
    }));
    throw new Error(error.message || 'API request failed');
  }

  return response.json();
}

export const apiClient = {
  // User endpoints
  async getProfile() {
    return fetchAPI('/me');
  },

  async updatePreferences(preferredGenres: string[]) {
    return fetchAPI('/me/preferences', {
      method: 'PUT',
      body: JSON.stringify({ preferredGenres }),
    });
  },

  // Recommendations
  async getRecommendations(params?: {
    mood?: string;
    activity?: string;
    timeBucket?: string;
    limit?: number;
  }) {
    const query = new URLSearchParams();
    if (params?.mood) query.set('mood', params.mood);
    if (params?.activity) query.set('activity', params.activity);
    if (params?.timeBucket) query.set('timeBucket', params.timeBucket);
    if (params?.limit) query.set('limit', params.limit.toString());

    const queryString = query.toString();
    return fetchAPI(`/recommendations${queryString ? `?${queryString}` : ''}`);
  },

  // Interactions
  async recordInteraction(event: {
    trackId: string;
    eventType: string;
    eventValue?: number;
    context?: any;
    clientTs: string;
  }) {
    return fetchAPI('/interactions', {
      method: 'POST',
      body: JSON.stringify(event),
    });
  },

  // Playlists
  async getPlaylists() {
    return fetchAPI('/playlists');
  },

  async getPlaylist(id: string) {
    return fetchAPI(`/playlists/${id}`);
  },

  async createPlaylist(name: string) {
    return fetchAPI('/playlists', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  async updatePlaylist(id: string, name: string) {
    return fetchAPI(`/playlists/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });
  },

  async deletePlaylist(id: string) {
    return fetchAPI(`/playlists/${id}`, {
      method: 'DELETE',
    });
  },

  async addTrackToPlaylist(playlistId: string, trackId: string) {
    return fetchAPI(`/playlists/${playlistId}/tracks`, {
      method: 'POST',
      body: JSON.stringify({ trackId }),
    });
  },

  async removeTrackFromPlaylist(playlistId: string, trackId: string) {
    return fetchAPI(`/playlists/${playlistId}/tracks/${trackId}`, {
      method: 'DELETE',
    });
  },
};
