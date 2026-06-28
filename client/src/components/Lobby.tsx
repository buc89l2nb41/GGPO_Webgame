/**
 * Lobby Component - Online matchmaking and room management
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { PeerConnection } from '../network/webrtc/PeerConnection';
import './Lobby.css';

interface LobbyProps {
  onGameStart: (connection: PeerConnection, isHost: boolean) => void;
  onBack: () => void;
}

type LobbyState = 'menu' | 'creating' | 'joining' | 'waiting' | 'quickmatch' | 'connecting';

export function Lobby({ onGameStart, onBack }: LobbyProps) {
  const [state, setState] = useState<LobbyState>('menu');
  const [connection, setConnection] = useState<PeerConnection | null>(null);
  const [roomId, setRoomId] = useState<string>('');
  const [inputRoomId, setInputRoomId] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [ping, setPing] = useState<number>(0);
  const gameStartedRef = useRef(false);

  const initConnection = useCallback(() => {
    gameStartedRef.current = false;
    const conn = new PeerConnection({
      onConnected: (peerId) => {
        console.log('Connected to peer:', peerId);
        gameStartedRef.current = true;
        onGameStart(conn, conn.isHostPlayer());
      },
      onDisconnected: () => {
        console.log('Disconnected');
        setError('Connection lost');
        setState('menu');
      },
      onData: (data) => {
        console.log('Received data:', data);
      },
      onError: (err) => {
        console.error('Connection error:', err);
        setError(err.message);
        setState('menu');
      },
      onPingUpdate: (p) => {
        setPing(p);
      },
    });
    
    setConnection(conn);
    return conn;
  }, [onGameStart]);

  useEffect(() => {
    return () => {
      if (connection && !gameStartedRef.current) {
        connection.disconnect();
      }
    };
  }, [connection]);

  const handleCreateRoom = useCallback(async () => {
    try {
      setState('creating');
      setError('');
      
      const conn = initConnection();
      await conn.connect();
      
      const newRoomId = await conn.createRoom();
      setRoomId(newRoomId);
      setState('waiting');
    } catch (err) {
      setError((err as Error).message);
      setState('menu');
    }
  }, [initConnection]);

  const handleJoinRoom = useCallback(async () => {
    if (!inputRoomId.trim()) {
      setError('Please enter a room code');
      return;
    }
    
    try {
      setState('joining');
      setError('');
      
      const conn = initConnection();
      await conn.connect();
      await conn.joinRoom(inputRoomId.toUpperCase());
      
      setRoomId(inputRoomId.toUpperCase());
      setState('connecting');
    } catch (err) {
      setError((err as Error).message);
      setState('menu');
    }
  }, [inputRoomId, initConnection]);

  const handleQuickMatch = useCallback(async () => {
    try {
      setState('quickmatch');
      setError('');
      
      const conn = initConnection();
      await conn.connect();
      
      const result = await conn.quickMatch();
      
      if (result.waiting) {
        setState('quickmatch');
      } else if (result.roomId) {
        setRoomId(result.roomId);
        setState('connecting');
      }
    } catch (err) {
      setError((err as Error).message);
      setState('menu');
    }
  }, [initConnection]);

  const handleCancel = useCallback(() => {
    if (connection) {
      if (state === 'quickmatch') {
        connection.cancelQuickMatch();
      }
      connection.disconnect();
    }
    setConnection(null);
    setState('menu');
    setRoomId('');
    setError('');
  }, [connection, state]);

  const copyRoomId = useCallback(() => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
    }
  }, [roomId]);

  return (
    <div className="lobby">
      <div className="lobby-container">
        <button className="back-button" onClick={onBack}>
          ← Back
        </button>
        
        <h1 className="lobby-title">ONLINE PLAY</h1>
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
        
        {state === 'menu' && (
          <div className="lobby-menu">
            <button className="lobby-btn primary" onClick={handleQuickMatch}>
              QUICK MATCH
            </button>
            <button className="lobby-btn" onClick={handleCreateRoom}>
              CREATE ROOM
            </button>
            <div className="join-room">
              <input
                type="text"
                placeholder="Enter Room Code"
                value={inputRoomId}
                onChange={(e) => setInputRoomId(e.target.value.toUpperCase())}
                maxLength={6}
                className="room-input"
              />
              <button className="lobby-btn" onClick={handleJoinRoom}>
                JOIN
              </button>
            </div>
          </div>
        )}
        
        {state === 'creating' && (
          <div className="lobby-status">
            <div className="spinner"></div>
            <p>Creating room...</p>
          </div>
        )}
        
        {state === 'waiting' && (
          <div className="lobby-status waiting">
            <p>Room Code:</p>
            <div className="room-code" onClick={copyRoomId}>
              {roomId}
              <span className="copy-hint">Click to copy</span>
            </div>
            <p className="waiting-text">Waiting for opponent...</p>
            <div className="spinner"></div>
            <button className="lobby-btn cancel" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        )}
        
        {state === 'joining' && (
          <div className="lobby-status">
            <div className="spinner"></div>
            <p>Joining room...</p>
          </div>
        )}
        
        {state === 'quickmatch' && (
          <div className="lobby-status">
            <div className="spinner"></div>
            <p>Searching for opponent...</p>
            <button className="lobby-btn cancel" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        )}
        
        {state === 'connecting' && (
          <div className="lobby-status">
            <div className="spinner"></div>
            <p>Connecting to opponent...</p>
            <p className="ping-info">Ping: {ping}ms</p>
          </div>
        )}
      </div>
    </div>
  );
}
