'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Track, RecommendationUpdateEvent } from '@music-rec/shared';

interface WebSocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
  recommendations: Track[];
  updateReason: string | null;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  socket: null,
  isConnected: false,
  recommendations: [],
  updateReason: null,
});

export function useWebSocket() {
  return useContext(WebSocketContext);
}

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [recommendations, setRecommendations] = useState<Track[]>([]);
  const [updateReason, setUpdateReason] = useState<string | null>(null);

  useEffect(() => {
    const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

    // In development, use a test user ID
    // In production, this would come from THE COPY platform session
    const userId = 'dev-user-123';

    const socketInstance = io(`${WS_URL}/recommendations`, {
      query: { userId },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socketInstance.on('connect', () => {
      console.log('WebSocket connected');
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);
    });

    socketInstance.on('recommendations:update', (event: RecommendationUpdateEvent) => {
      console.log('Received recommendation update:', event.reason);
      setRecommendations(event.tracks);
      setUpdateReason(event.reason);
    });

    socketInstance.on('pong', (data: any) => {
      console.log('Pong received:', data);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return (
    <WebSocketContext.Provider
      value={{ socket, isConnected, recommendations, updateReason }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}
