'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

const AVAILABLE_GENRES = [
  'Pop',
  'Rock',
  'Hip Hop',
  'Electronic',
  'Jazz',
  'Classical',
  'R&B',
  'Country',
  'Indie',
  'Metal',
  'Reggae',
  'Blues',
  'Folk',
  'Latin',
  'K-Pop',
  'Funk',
  'Soul',
  'Ambient',
];

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: (preferredGenres: string[]) => void;
  onSkip: () => void;
}

export function OnboardingModal({ isOpen, onComplete, onSkip }: OnboardingModalProps) {
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);

  if (!isOpen) return null;

  const toggleGenre = (genre: string) => {
    if (selectedGenres.includes(genre)) {
      setSelectedGenres(selectedGenres.filter((g) => g !== genre));
    } else {
      if (selectedGenres.length < 10) {
        setSelectedGenres([...selectedGenres, genre]);
      }
    }
  };

  const handleSubmit = () => {
    if (selectedGenres.length > 0) {
      onComplete(selectedGenres);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl shadow-2xl max-w-2xl w-full p-8 relative">
        <button
          onClick={onSkip}
          className="absolute top-4 right-4 text-gray-400 hover:text-white"
        >
          <X className="w-6 h-6" />
        </button>

        <h2 className="text-3xl font-bold text-white mb-2">Welcome! 🎵</h2>
        <p className="text-gray-400 mb-6">
          Select your favorite genres to get personalized recommendations
          <br />
          <span className="text-sm">
            (Choose at least 1, up to 10 genres)
          </span>
        </p>

        <div className="grid grid-cols-3 gap-3 mb-6 max-h-96 overflow-y-auto">
          {AVAILABLE_GENRES.map((genre) => (
            <button
              key={genre}
              onClick={() => toggleGenre(genre)}
              className={`px-4 py-3 rounded-lg font-medium transition-all ${
                selectedGenres.includes(genre)
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              {genre}
            </button>
          ))}
        </div>

        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-400">
            {selectedGenres.length} selected
          </p>
          <div className="flex gap-3">
            <button
              onClick={onSkip}
              className="px-6 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-all"
            >
              Skip for now
            </button>
            <button
              onClick={handleSubmit}
              disabled={selectedGenres.length === 0}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${
                selectedGenres.length > 0
                  ? 'bg-primary-500 text-white hover:bg-primary-600'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
