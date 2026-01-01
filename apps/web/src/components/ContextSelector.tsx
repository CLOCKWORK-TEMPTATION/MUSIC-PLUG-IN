'use client';

import { useState } from 'react';
import { Mood, Activity, TimeBucket } from '@music-rec/shared';

interface ContextSelectorProps {
  onContextChange: (context: {
    mood?: Mood;
    activity?: Activity;
    timeBucket?: TimeBucket;
  }) => void;
}

export function ContextSelector({ onContextChange }: ContextSelectorProps) {
  const [mood, setMood] = useState<Mood | undefined>();
  const [activity, setActivity] = useState<Activity | undefined>();

  const handleMoodChange = (newMood: Mood) => {
    const selectedMood = mood === newMood ? undefined : newMood;
    setMood(selectedMood);
    onContextChange({ mood: selectedMood, activity });
  };

  const handleActivityChange = (newActivity: Activity) => {
    const selectedActivity = activity === newActivity ? undefined : newActivity;
    setActivity(selectedActivity);
    onContextChange({ mood, activity: selectedActivity });
  };

  return (
    <div className="bg-gray-800 rounded-xl p-6 shadow-lg">
      <h3 className="text-lg font-semibold text-white mb-4">Set Your Vibe</h3>

      {/* Mood Selector */}
      <div className="mb-4">
        <label className="text-sm text-gray-400 mb-2 block">Mood</label>
        <div className="grid grid-cols-4 gap-2">
          {Object.values(Mood).map((m) => (
            <button
              key={m}
              onClick={() => handleMoodChange(m)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                mood === m
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {m.charAt(0) + m.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Activity Selector */}
      <div>
        <label className="text-sm text-gray-400 mb-2 block">Activity</label>
        <div className="grid grid-cols-4 gap-2">
          {Object.values(Activity).map((a) => (
            <button
              key={a}
              onClick={() => handleActivityChange(a)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activity === a
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {a.charAt(0) + a.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
