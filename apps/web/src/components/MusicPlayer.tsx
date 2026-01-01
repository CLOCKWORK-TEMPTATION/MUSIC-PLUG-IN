'use client';

import { useState } from 'react';
import { Track, EventType } from '@music-rec/shared';
import { Play, Pause, Heart, X, ListPlus, ThumbsDown } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface MusicPlayerProps {
  track: Track;
  context?: {
    mood?: string;
    activity?: string;
    timeBucket?: string;
  };
  onNext: () => void;
}

export function MusicPlayer({ track, context, onNext }: MusicPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLiked, setIsLiked] = useState(false);

  const recordInteraction = async (eventType: EventType) => {
    try {
      await apiClient.recordInteraction({
        trackId: track.id,
        eventType,
        context,
        clientTs: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to record interaction:', error);
    }
  };

  const handlePlayPause = () => {
    if (!isPlaying) {
      recordInteraction(EventType.PLAY);
    }
    setIsPlaying(!isPlaying);
  };

  const handleLike = async () => {
    setIsLiked(!isLiked);
    await recordInteraction(EventType.LIKE);
  };

  const handleDislike = async () => {
    await recordInteraction(EventType.DISLIKE);
    onNext();
  };

  const handleSkip = async () => {
    await recordInteraction(EventType.SKIP);
    onNext();
  };

  const handleAddToPlaylist = async () => {
    await recordInteraction(EventType.ADD_TO_PLAYLIST);
    // In a full implementation, this would open a playlist selector
    alert('Add to playlist feature coming soon!');
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-2xl p-8 max-w-2xl w-full">
      {/* Album Art Placeholder */}
      <div className="w-full aspect-square bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl mb-6 flex items-center justify-center">
        <div className="text-white text-6xl font-bold opacity-20">♪</div>
      </div>

      {/* Track Info */}
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">{track.title}</h2>
        <p className="text-xl text-gray-300 mb-1">{track.artist}</p>
        {track.album && <p className="text-sm text-gray-400">{track.album}</p>}
        <div className="flex justify-center gap-4 mt-2 text-sm text-gray-500">
          <span>{track.genre}</span>
          <span>•</span>
          <span>{formatDuration(track.durationSec)}</span>
        </div>
      </div>

      {/* Play/Pause Button */}
      <div className="flex justify-center mb-8">
        <button
          onClick={handlePlayPause}
          className="bg-primary-500 hover:bg-primary-600 text-white rounded-full p-6 transition-all transform hover:scale-105 shadow-lg"
        >
          {isPlaying ? (
            <Pause className="w-10 h-10" />
          ) : (
            <Play className="w-10 h-10 ml-1" />
          )}
        </button>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center gap-4">
        <button
          onClick={handleLike}
          className={`p-4 rounded-full transition-all ${
            isLiked
              ? 'bg-red-500 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
          title="Like"
        >
          <Heart className={`w-6 h-6 ${isLiked ? 'fill-current' : ''}`} />
        </button>

        <button
          onClick={handleDislike}
          className="p-4 rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600 transition-all"
          title="Dislike"
        >
          <ThumbsDown className="w-6 h-6" />
        </button>

        <button
          onClick={handleSkip}
          className="p-4 rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600 transition-all"
          title="Skip"
        >
          <X className="w-6 h-6" />
        </button>

        <button
          onClick={handleAddToPlaylist}
          className="p-4 rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600 transition-all"
          title="Add to Playlist"
        >
          <ListPlus className="w-6 h-6" />
        </button>
      </div>

      {/* Preview/External Link */}
      {(track.previewUrl || track.externalUrl) && (
        <div className="mt-6 text-center">
          {track.previewUrl ? (
            <a
              href={track.previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-400 hover:text-primary-300 text-sm"
            >
              Play Preview
            </a>
          ) : (
            <a
              href={track.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-400 hover:text-primary-300 text-sm"
            >
              Listen on External Platform
            </a>
          )}
        </div>
      )}
    </div>
  );
}
