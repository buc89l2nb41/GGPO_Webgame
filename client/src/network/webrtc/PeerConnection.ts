/**

 * WebRTC Peer Connection Manager

 * Handles P2P connection establishment and data channel communication

 */



import Peer, { DataConnection } from 'peerjs';

import { io, Socket } from 'socket.io-client';

import { getSignalingServerUrl } from '../../config/network';

import { isSyncWireMessage, SyncWireMessage } from '../sync/syncMessages';
import { isMatchReadyMessage } from '../sync/matchReadyMessages';



export interface PeerConnectionConfig {

  serverUrl: string;

  iceServers?: RTCIceServer[];

}



export interface ConnectionCallbacks {

  onConnected: (peerId: string) => void;

  onDisconnected: () => void;

  onData: (data: unknown) => void;

  onError: (error: Error) => void;

  onPingUpdate: (ping: number) => void;

}



export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';



const DEFAULT_CONFIG: PeerConnectionConfig = {

  serverUrl: getSignalingServerUrl(),

  iceServers: [

    { urls: 'stun:stun.l.google.com:19302' },

    { urls: 'stun:stun1.l.google.com:19302' },

    {

      urls: 'turn:openrelay.metered.ca:80',

      username: 'openrelayproject',

      credential: 'openrelayproject',

    },

    {

      urls: 'turn:openrelay.metered.ca:443',

      username: 'openrelayproject',

      credential: 'openrelayproject',

    },

  ],

};



const HOST_CONNECT_MAX_ATTEMPTS = 20;

const HOST_CONNECT_RETRY_MS = 500;

const PEER_CONNECT_TIMEOUT_MS = 20000;



export class PeerConnection {

  private config: PeerConnectionConfig;

  private callbacks: ConnectionCallbacks;

  private socket: Socket | null = null;

  private peer: Peer | null = null;

  private connection: DataConnection | null = null;

  private state: ConnectionState = 'disconnected';



  private localId: string | null = null;

  private remoteSocketId: string | null = null;

  private remotePeerJsId: string | null = null;

  private localPeerJsReady = false;

  private roomId: string | null = null;

  private isHost: boolean = false;



  private pingInterval: ReturnType<typeof setInterval> | null = null;

  private currentPing: number = 0;

  private lastPingTime: number = 0;

  private inputListener: ((frame: number, encodedInput: number) => void) | null = null;

  private syncListener: ((message: SyncWireMessage) => void) | null = null;

  private matchReadyListener: (() => void) | null = null;

  private lifecycleCallbacks: Partial<ConnectionCallbacks> | null = null;

  private hostConnectAttempts = 0;

  private hostConnectTimer: ReturnType<typeof setTimeout> | null = null;

  private peerConnectTimeout: ReturnType<typeof setTimeout> | null = null;



  constructor(callbacks: ConnectionCallbacks, config: Partial<PeerConnectionConfig> = {}) {

    this.config = { ...DEFAULT_CONFIG, ...config };

    this.callbacks = callbacks;

  }



  setInputListener(listener: ((frame: number, encodedInput: number) => void) | null): void {

    this.inputListener = listener;

  }



  setSyncListener(listener: ((message: SyncWireMessage) => void) | null): void {

    this.syncListener = listener;

  }



  setMatchReadyListener(listener: (() => void) | null): void {

    this.matchReadyListener = listener;

  }



  setLifecycleCallbacks(callbacks: Partial<ConnectionCallbacks> | null): void {

    this.lifecycleCallbacks = callbacks;

  }



  private dispatchRemoteInput(frame: number, encodedInput: number): void {

    this.inputListener?.(frame, encodedInput);

  }



  private dispatchSyncMessage(message: SyncWireMessage): void {

    this.syncListener?.(message);

  }



  private dispatchMatchReady(): void {

    this.matchReadyListener?.();

  }



  async connect(): Promise<void> {

    if (this.state === 'connecting' || this.state === 'connected') {

      return;

    }



    this.state = 'connecting';



    try {

      this.socket = io(this.config.serverUrl, {

        transports: ['websocket', 'polling'],

        autoConnect: true,

      });



      await this.waitForSocketConnection();

      this.setupSocketHandlers();

      this.localId = this.socket.id || null;



      console.log(`Connected to signaling server with ID: ${this.localId}`);

    } catch (error) {

      this.state = 'error';

      this.callbacks.onError(error as Error);

      throw error;

    }

  }



  private waitForSocketConnection(): Promise<void> {

    return new Promise((resolve, reject) => {

      if (!this.socket) {

        reject(new Error('Socket not initialized'));

        return;

      }



      const timeout = setTimeout(() => {

        reject(new Error('Signaling server connection timeout'));

      }, 10000);



      this.socket.on('connect', () => {

        clearTimeout(timeout);

        resolve();

      });



      this.socket.on('connect_error', (error) => {

        clearTimeout(timeout);

        reject(error);

      });

    });

  }



  private setupSocketHandlers(): void {

    if (!this.socket) return;



    this.socket.on('game-start', (data: { players: string[]; hostId: string; roomId?: string }) => {

      console.log('Game starting:', data);

      this.isHost = data.hostId === this.localId;

      this.remoteSocketId = data.players.find((id) => id !== this.localId) || null;

      this.roomId = data.roomId || this.roomId;

      this.remotePeerJsId = null;

      this.localPeerJsReady = false;

      this.hostConnectAttempts = 0;



      if (this.remoteSocketId) {

        this.startPeerConnectTimeout();

        this.initializePeerConnection();

      }

    });



    this.socket.on('peer-ready', (data: { peerId: string; socketId: string }) => {

      if (!data.peerId || data.socketId === this.localId) return;

      console.log('Opponent peer ready:', data.peerId);

      this.remotePeerJsId = data.peerId;

      this.tryConnectAsHost();

    });



    this.socket.on('player-left', (data: { playerId: string }) => {

      console.log('Player left:', data.playerId);

      if (data.playerId === this.remoteSocketId) {

        this.handleDisconnect();

      }

    });



    this.socket.on('game-ended', (data: { reason: string }) => {

      console.log('Game ended:', data.reason);

      this.handleDisconnect();

    });



    this.socket.on('signal', (data: { senderId: string; signal: unknown }) => {

      console.log('Received signal from:', data.senderId);

    });



    this.socket.on('game-input', (data: { playerId: string; frame: number; encodedInput: number }) => {

      this.dispatchRemoteInput(data.frame, data.encodedInput);

      this.callbacks.onData({

        type: 'input',

        playerId: data.playerId,

        frame: data.frame,

        encodedInput: data.encodedInput,

      });

    });



    this.socket.on('sync-message', (data: SyncWireMessage) => {

      if (isSyncWireMessage(data)) {

        this.dispatchSyncMessage(data);

      }

    });



    this.socket.on('match-ready', () => {

      this.dispatchMatchReady();

    });



    this.socket.on('disconnect', () => {

      console.log('Disconnected from signaling server');

      this.handleDisconnect();

    });

  }



  private startPeerConnectTimeout(): void {

    this.clearPeerConnectTimeout();

    this.peerConnectTimeout = setTimeout(() => {

      if (this.state !== 'connected') {

        this.callbacks.onError(

          new Error('P2P connection timeout. Check firewall/NAT or try again on the same network.'),

        );

      }

    }, PEER_CONNECT_TIMEOUT_MS);

  }



  private clearPeerConnectTimeout(): void {

    if (this.peerConnectTimeout) {

      clearTimeout(this.peerConnectTimeout);

      this.peerConnectTimeout = null;

    }

  }



  private initializePeerConnection(): void {

    if (!this.localId) return;



    if (this.peer) {

      this.peer.destroy();

      this.peer = null;

    }



    // Use signaling socket id as PeerJS id so both sides can find each other.

    this.peer = new Peer(this.localId, {

      config: {

        iceServers: this.config.iceServers,

      },

    });



    this.peer.on('open', (id) => {

      console.log('PeerJS ready:', id);

      this.localPeerJsReady = true;

      this.socket?.emit('peer-ready', { peerId: id });

      this.tryConnectAsHost();

    });



    this.peer.on('connection', (conn) => {

      console.log('Incoming peer connection from:', conn.peer);

      this.setupDataConnection(conn);

    });



    this.peer.on('error', (error) => {

      console.error('Peer error:', error);

      const message = String(error);

      if (this.isHost && message.includes('Could not connect to peer')) {

        this.scheduleHostConnectRetry();

        return;

      }

      this.callbacks.onError(error);

    });

  }



  private tryConnectAsHost(): void {

    if (!this.isHost || !this.peer || !this.localPeerJsReady || !this.remotePeerJsId) {

      return;

    }

    if (this.connection?.open) return;



    this.clearHostConnectRetry();

    this.connectToPeer(this.remotePeerJsId);

  }



  private scheduleHostConnectRetry(): void {

    if (!this.isHost || this.connection?.open) return;

    if (this.hostConnectAttempts >= HOST_CONNECT_MAX_ATTEMPTS) {

      this.callbacks.onError(new Error('Could not connect to peer'));

      return;

    }



    this.clearHostConnectRetry();

    this.hostConnectTimer = setTimeout(() => {

      if (this.remotePeerJsId) {

        this.connectToPeer(this.remotePeerJsId);

      }

    }, HOST_CONNECT_RETRY_MS);

  }



  private clearHostConnectRetry(): void {

    if (this.hostConnectTimer) {

      clearTimeout(this.hostConnectTimer);

      this.hostConnectTimer = null;

    }

  }



  private connectToPeer(peerId: string): void {

    if (!this.peer) return;



    this.hostConnectAttempts += 1;

    console.log(`Connecting to peer ${peerId} (attempt ${this.hostConnectAttempts})`);



    const conn = this.peer.connect(peerId, {

      reliable: false,

      serialization: 'json',

    });



    this.setupDataConnection(conn);

  }



  private setupDataConnection(conn: DataConnection): void {

    if (this.connection && this.connection.open) {

      return;

    }



    this.connection = conn;



    conn.on('open', () => {

      console.log('Data channel open with', conn.peer);

      this.clearHostConnectRetry();

      this.clearPeerConnectTimeout();

      this.state = 'connected';

      this.callbacks.onConnected(conn.peer);

      this.startPingMeasurement();

    });



    conn.on('data', (data) => {

      if (typeof data === 'object' && data !== null && 'type' in data) {

        const typedData = data as { type: string };

        if (typedData.type === 'ping') {
          const pingMessage = data as { type: string; timestamp: number };
          conn.send({ type: 'pong', timestamp: pingMessage.timestamp });

        } else if (typedData.type === 'pong') {
          const pongMessage = data as { type: string; timestamp: number };
          const ping = Date.now() - pongMessage.timestamp;

          this.currentPing = ping;

          this.callbacks.onPingUpdate(ping);

        } else if (typedData.type === 'input' && 'frame' in data && 'encodedInput' in data) {

          const inputData = data as { frame: number; encodedInput: number };

          this.dispatchRemoteInput(inputData.frame, inputData.encodedInput);

          this.callbacks.onData(data);

        } else if (isSyncWireMessage(data)) {

          this.dispatchSyncMessage(data);

          this.callbacks.onData(data);

        } else if (isMatchReadyMessage(data)) {

          this.dispatchMatchReady();

        } else {

          this.callbacks.onData(data);

        }

      } else {

        this.callbacks.onData(data);

      }

    });



    conn.on('close', () => {

      console.log('Data channel closed');

      this.handleDisconnect();

    });



    conn.on('error', (error) => {

      console.error('Data channel error:', error);

      if (this.isHost) {

        this.scheduleHostConnectRetry();

        return;

      }

      this.callbacks.onError(error);

    });

  }



  private startPingMeasurement(): void {

    this.stopPingMeasurement();



    this.pingInterval = setInterval(() => {

      if (this.connection && this.connection.open) {

        this.lastPingTime = Date.now();

        this.connection.send({ type: 'ping', timestamp: this.lastPingTime });

      }

    }, 1000);

  }



  private stopPingMeasurement(): void {

    if (this.pingInterval) {

      clearInterval(this.pingInterval);

      this.pingInterval = null;

    }

  }



  private handleDisconnect(): void {

    this.stopPingMeasurement();

    this.clearHostConnectRetry();

    this.clearPeerConnectTimeout();



    if (this.connection) {

      this.connection.close();

      this.connection = null;

    }



    if (this.peer) {

      this.peer.destroy();

      this.peer = null;

    }



    this.state = 'disconnected';

    this.remoteSocketId = null;

    this.remotePeerJsId = null;

    this.localPeerJsReady = false;

    this.hostConnectAttempts = 0;

    this.callbacks.onDisconnected();

    this.lifecycleCallbacks?.onDisconnected?.();

  }



  async createRoom(): Promise<string> {

    if (!this.socket) {

      throw new Error('Not connected to signaling server');

    }



    return new Promise((resolve, reject) => {

      this.socket!.emit('create-room', (response: { success: boolean; roomId?: string; error?: string }) => {

        if (response.success && response.roomId) {

          this.roomId = response.roomId;

          this.isHost = true;

          resolve(response.roomId);

        } else {

          reject(new Error(response.error || 'Failed to create room'));

        }

      });

    });

  }



  async joinRoom(roomId: string): Promise<void> {

    if (!this.socket) {

      throw new Error('Not connected to signaling server');

    }



    return new Promise((resolve, reject) => {

      this.socket!.emit('join-room', roomId, (response: { success: boolean; error?: string }) => {

        if (response.success) {

          this.roomId = roomId;

          this.isHost = false;

          resolve();

        } else {

          reject(new Error(response.error || 'Failed to join room'));

        }

      });

    });

  }



  async quickMatch(): Promise<{ waiting: boolean; roomId?: string }> {

    if (!this.socket) {

      throw new Error('Not connected to signaling server');

    }



    return new Promise((resolve, reject) => {

      this.socket!.emit('quick-match', (response: { success: boolean; roomId?: string; waiting?: boolean; error?: string }) => {

        if (response.success) {

          if (response.roomId) {

            this.roomId = response.roomId;

          }

          resolve({ waiting: response.waiting || false, roomId: response.roomId });

        } else {

          reject(new Error(response.error || 'Failed to start quick match'));

        }

      });

    });

  }



  cancelQuickMatch(): void {

    if (this.socket) {

      this.socket.emit('cancel-quick-match');

    }

  }



  send(data: unknown): void {

    if (this.connection && this.connection.open) {

      this.connection.send(data);

    } else if (this.socket && this.roomId) {

      if (typeof data === 'object' && data !== null && 'type' in data) {

        const typedData = data as { type: string; frame?: number; encodedInput?: number };

        if (typedData.type === 'input' && typedData.frame !== undefined && typedData.encodedInput !== undefined) {

          this.socket.emit('game-input', {

            frame: typedData.frame,

            encodedInput: typedData.encodedInput,

          });

        } else if (isSyncWireMessage(data)) {

          this.socket.emit('sync-message', data);

        } else if (isMatchReadyMessage(data)) {

          this.socket.emit('match-ready', data);

        }

      }

    }

  }



  sendInput(frame: number, encodedInput: number): void {

    this.send({

      type: 'input',

      frame,

      encodedInput,

    });

  }



  sendSyncMessage(message: SyncWireMessage): void {

    this.send(message);

  }



  sendMatchReady(): void {

    this.send({ type: 'match-ready' });

  }



  getState(): ConnectionState {

    return this.state;

  }



  getPing(): number {

    return this.currentPing;

  }



  getLocalId(): string | null {

    return this.localId;

  }



  getRemoteId(): string | null {

    return this.remoteSocketId;

  }



  getRoomId(): string | null {

    return this.roomId;

  }



  isHostPlayer(): boolean {

    return this.isHost;

  }



  disconnect(): void {

    this.handleDisconnect();



    if (this.socket) {

      this.socket.disconnect();

      this.socket = null;

    }



    this.localId = null;

    this.roomId = null;

    this.isHost = false;

  }

}


