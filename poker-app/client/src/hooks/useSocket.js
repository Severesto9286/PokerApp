import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

export function useSocket({ roomId, playerId, onEvent }) {
  const socketRef = useRef(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!roomId || !playerId) return;

    const socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('Connected, identifying...');
      socket.emit('identify', { roomId, playerId });
    });

    socket.on('disconnect', () => {
      onEventRef.current({ type: 'disconnected' });
    });

    socket.on('reconnect', () => {
      socket.emit('identify', { roomId, playerId });
    });

    const events = [
      'identified', 'gameState', 'error', 'joinRequest', 'joinApproved', 'playerJoined',
      'handStarted', 'actionTaken', 'newStreet', 'handComplete', 'yourTurn',
      'runItTwiceOffer', 'runItTwiceVote', 'playerConnected', 'playerDisconnected',
      'blindsChanged', 'kicked', 'chat'
    ];

    for (const event of events) {
      socket.on(event, (data) => {
        onEventRef.current({ type: event, data });
      });
    }

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId, playerId]);

  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  return { emit };
}
