import express, { type Request, type Response } from 'express';
import { createServer } from 'http';
import { networkInterfaces } from 'node:os';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import { Matchmaking } from './matchmaking';

const PORT = process.env.PORT || 3001;
const isDev = process.env.NODE_ENV !== 'production';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: isDev ? true : CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

app.use(cors(isDev ? { origin: true } : { origin: CLIENT_ORIGIN }));
app.use(express.json());

const matchmaking = new Matchmaking();

interface RoomData {
  roomId: string;
  players: string[];
  host: string;
  state: 'waiting' | 'playing' | 'finished';
}

const rooms = new Map<string, RoomData>();
const playerRooms = new Map<string, string>();

io.on('connection', (socket: Socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('create-room', (callback: (response: { success: boolean; roomId?: string; error?: string }) => void) => {
    const roomId = generateRoomId();
    const room: RoomData = {
      roomId,
      players: [socket.id],
      host: socket.id,
      state: 'waiting',
    };
    
    rooms.set(roomId, room);
    playerRooms.set(socket.id, roomId);
    socket.join(roomId);
    
    console.log(`Room created: ${roomId} by ${socket.id}`);
    callback({ success: true, roomId });
  });

  socket.on('join-room', (roomId: string, callback: (response: { success: boolean; error?: string }) => void) => {
    const room = rooms.get(roomId);
    
    if (!room) {
      callback({ success: false, error: 'Room not found' });
      return;
    }
    
    if (room.players.length >= 2) {
      callback({ success: false, error: 'Room is full' });
      return;
    }
    
    if (room.state !== 'waiting') {
      callback({ success: false, error: 'Game already in progress' });
      return;
    }
    
    room.players.push(socket.id);
    playerRooms.set(socket.id, roomId);
    socket.join(roomId);
    
    callback({ success: true });
    
    io.to(room.host).emit('player-joined', { playerId: socket.id });
    
    if (room.players.length === 2) {
      room.state = 'playing';
      io.to(roomId).emit('game-start', {
        players: room.players,
        hostId: room.host,
      });
    }
    
    console.log(`Player ${socket.id} joined room ${roomId}`);
  });

  socket.on('leave-room', () => {
    const roomId = playerRooms.get(socket.id);
    if (roomId) {
      handlePlayerLeave(socket, roomId);
    }
  });

  socket.on('signal', (data: { targetId: string; signal: unknown }) => {
    io.to(data.targetId).emit('signal', {
      senderId: socket.id,
      signal: data.signal,
    });
  });

  socket.on('peer-ready', (data: { peerId: string }) => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId || !data.peerId) return;

    socket.to(roomId).emit('peer-ready', {
      peerId: data.peerId,
      socketId: socket.id,
    });
  });

  socket.on('game-input', (data: { frame: number; encodedInput: number }) => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) return;
    
    socket.to(roomId).emit('game-input', {
      playerId: socket.id,
      frame: data.frame,
      encodedInput: data.encodedInput,
    });
  });

  socket.on('sync-message', (data: unknown) => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) return;

    socket.to(roomId).emit('sync-message', data);
  });

  socket.on('ping-request', (timestamp: number, callback: (response: { timestamp: number; serverTime: number }) => void) => {
    callback({ timestamp, serverTime: Date.now() });
  });

  socket.on('quick-match', (callback: (response: { success: boolean; roomId?: string; waiting?: boolean; error?: string }) => void) => {
    const result = matchmaking.addPlayer(socket.id);
    
    if (result.matched) {
      const roomId = generateRoomId();
      const room: RoomData = {
        roomId,
        players: [result.opponent!, socket.id],
        host: result.opponent!,
        state: 'playing',
      };
      
      rooms.set(roomId, room);
      playerRooms.set(socket.id, roomId);
      playerRooms.set(result.opponent!, roomId);
      
      socket.join(roomId);
      const opponentSocket = io.sockets.sockets.get(result.opponent!);
      if (opponentSocket) {
        opponentSocket.join(roomId);
      }
      
      io.to(roomId).emit('game-start', {
        players: room.players,
        hostId: room.host,
        roomId,
      });
      
      callback({ success: true, roomId });
      console.log(`Quick match: ${socket.id} vs ${result.opponent} in room ${roomId}`);
    } else {
      callback({ success: true, waiting: true });
      console.log(`Player ${socket.id} waiting for match`);
    }
  });

  socket.on('cancel-quick-match', () => {
    matchmaking.removePlayer(socket.id);
    console.log(`Player ${socket.id} cancelled quick match`);
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    matchmaking.removePlayer(socket.id);
    
    const roomId = playerRooms.get(socket.id);
    if (roomId) {
      handlePlayerLeave(socket, roomId);
    }
  });
});

function handlePlayerLeave(socket: Socket, roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  
  room.players = room.players.filter(id => id !== socket.id);
  playerRooms.delete(socket.id);
  socket.leave(roomId);
  
  if (room.players.length === 0) {
    rooms.delete(roomId);
    console.log(`Room ${roomId} deleted (empty)`);
  } else {
    io.to(roomId).emit('player-left', { playerId: socket.id });
    
    if (room.state === 'playing') {
      room.state = 'finished';
      io.to(roomId).emit('game-ended', { reason: 'opponent-disconnected' });
    }
    
    if (room.host === socket.id && room.players.length > 0) {
      room.host = room.players[0];
      io.to(roomId).emit('host-changed', { newHostId: room.host });
    }
  }
}

function generateRoomId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', players: io.sockets.sockets.size, rooms: rooms.size });
});

app.get('/rooms', (_req: Request, res: Response) => {
  const publicRooms = Array.from(rooms.entries())
    .filter(([_, room]) => room.state === 'waiting')
    .map(([id, room]) => ({
      roomId: id,
      players: room.players.length,
      maxPlayers: 2,
    }));
  
  res.json({ rooms: publicRooms });
});

function getLanAddresses(): string[] {
  const nets = networkInterfaces();
  const addresses: string[] = [];
  for (const iface of Object.values(nets)) {
    for (const net of iface ?? []) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  return addresses;
}

httpServer.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Signaling server running on port ${PORT}`);
  const lan = getLanAddresses();
  if (lan.length > 0) {
    console.log('LAN access:');
    for (const ip of lan) {
      console.log(`  http://${ip}:${PORT}`);
    }
  }
});
