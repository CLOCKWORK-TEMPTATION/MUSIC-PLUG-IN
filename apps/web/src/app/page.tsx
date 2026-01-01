'use client';

import { useEffect, useState } from 'react';
import { Track, Mood, Activity } from '@music-rec/shared';
import { MusicPlayer } from '@/components/MusicPlayer';
import { ContextSelector } from '@/components/ContextSelector';
import { OnboardingModal } from '@/components/OnboardingModal';
import { useWebSocket } from '@/contexts/WebSocketContext';
import { apiClient } from '@/lib/api-client';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';

export default function HomePage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [context, setContext] = useState<{
    mood?: Mood;
    activity?: Activity;
  }>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);

  const { isConnected, recommendations, updateReason } = useWebSocket();

  // Check if user needs onboarding
  useEffect(() => {
    async function checkProfile() {
      try {
        const profile = await apiClient.getProfile();
        setUserProfile(profile);

        // Show onboarding if user has no preferred genres
        if (!profile.preferredGenres || profile.preferredGenres.length === 0) {
          setShowOnboarding(true);
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error);
      }
    }

    checkProfile();
  }, []);

  // Fetch initial recommendations
  useEffect(() => {
    async function fetchRecommendations() {
      setIsLoading(true);
      try {
        const response = await apiClient.getRecommendations({
          mood: context.mood,
          activity: context.activity,
          limit: 20,
        });
        setTracks(response.tracks);
        setCurrentIndex(0);
      } catch (error) {
        console.error('Failed to fetch recommendations:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchRecommendations();
  }, [context]);

  // Handle WebSocket updates
  useEffect(() => {
    if (recommendations.length > 0) {
      setTracks(recommendations);
      setCurrentIndex(0);
    }
  }, [recommendations]);

  const handleNext = () => {
    if (currentIndex < tracks.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Fetch more recommendations
      handleRefresh();
    }
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.getRecommendations({
        mood: context.mood,
        activity: context.activity,
        limit: 20,
      });
      setTracks(response.tracks);
      setCurrentIndex(0);
    } catch (error) {
      console.error('Failed to refresh recommendations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOnboardingComplete = async (preferredGenres: string[]) => {
    try {
      await apiClient.updatePreferences(preferredGenres);
      setShowOnboarding(false);
      handleRefresh();
    } catch (error) {
      console.error('Failed to update preferences:', error);
    }
  };

  const handleOnboardingSkip = () => {
    setShowOnboarding(false);
  };

  const currentTrack = tracks[currentIndex];

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-black text-white">
      {/* Header */}
      <header className="p-6 flex justify-between items-center border-b border-gray-800">
        <div>
          <h1 className="text-3xl font-bold">Music Recommendations</h1>
          <p className="text-gray-400 text-sm mt-1">
            Powered by THE COPY Platform
          </p>
        </div>
        <div className="flex items-center gap-4">
          {/* Connection Status */}
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
              isConnected ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
            }`}
          >
            {isConnected ? (
              <>
                <Wifi className="w-4 h-4" />
                <span className="text-sm">Live</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4" />
                <span className="text-sm">Offline</span>
              </>
            )}
          </div>

          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      <div className="container mx-auto px-6 py-12">
        {/* Update Notification */}
        {updateReason && (
          <div className="mb-6 p-4 bg-blue-900/30 border border-blue-500/50 rounded-lg text-blue-300">
            {updateReason === 'skip_detected'
              ? '⚡ Recommendations updated based on your recent skips'
              : '🔄 Recommendations refreshed'}
          </div>
        )}

        {/* Context Selector */}
        <div className="mb-8">
          <ContextSelector onContextChange={setContext} />
        </div>

        {/* Music Player */}
        <div className="flex justify-center items-center">
          {isLoading ? (
            <div className="text-center py-20">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-500 mx-auto mb-4"></div>
              <p className="text-gray-400">Loading your personalized recommendations...</p>
            </div>
          ) : currentTrack ? (
            <div className="w-full max-w-2xl">
              <div className="mb-4 text-center text-gray-400 text-sm">
                Track {currentIndex + 1} of {tracks.length}
              </div>
              <MusicPlayer track={currentTrack} context={context} onNext={handleNext} />
            </div>
          ) : (
            <div className="text-center py-20">
              <p className="text-gray-400 text-lg">No recommendations available</p>
              <button
                onClick={handleRefresh}
                className="mt-4 px-6 py-2 bg-primary-500 hover:bg-primary-600 rounded-lg transition-all"
              >
                Load Recommendations
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Onboarding Modal */}
      <OnboardingModal
        isOpen={showOnboarding}
        onComplete={handleOnboardingComplete}
        onSkip={handleOnboardingSkip}
      />
    </main>
  );
}
