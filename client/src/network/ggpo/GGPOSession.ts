/**
 * GGPO Session - Main rollback netcode session manager
 * Coordinates input prediction, state saving, and rollback/resimulation
 */

import { GameState, InputState, cloneGameState } from '../../game/engine/GameState';
import { InputBuffer } from './InputBuffer';
import { StateManager } from './StateManager';

export interface GGPOConfig {
  inputDelay: number;
  maxRollbackFrames: number;
  maxPredictionFrames: number;
  syncTestEnabled: boolean;
}

export interface GGPOStats {
  currentFrame: number;
  lastConfirmedFrame: number;
  rollbackCount: number;
  totalRollbackFrames: number;
  averageRollbackFrames: number;
  predictionErrors: number;
  ping: number;
  inputDelay: number;
}

export interface GGPOCallbacks {
  onAdvanceFrame: (state: GameState, inputs: [InputState, InputState]) => GameState;
  onSaveState: (frame: number) => void;
  onLoadState: (frame: number) => void;
  onRollback: (fromFrame: number, toFrame: number) => void;
  onSyncError?: (frame: number, localChecksum: number, remoteChecksum: number) => void;
}

const DEFAULT_CONFIG: GGPOConfig = {
  inputDelay: 2,
  maxRollbackFrames: 8,
  maxPredictionFrames: 8,
  syncTestEnabled: false,
};

export type GGPOSessionState = 'disconnected' | 'synchronizing' | 'running' | 'interrupted';

export class GGPOSession {
  private config: GGPOConfig;
  private inputBuffer: InputBuffer;
  private stateManager: StateManager;
  private callbacks: GGPOCallbacks;
  
  private currentFrame: number = 0;
  private syncFrame: number = 0;
  private localPlayerIndex: number = 0;
  private sessionState: GGPOSessionState = 'disconnected';
  
  private stats: GGPOStats = {
    currentFrame: 0,
    lastConfirmedFrame: -1,
    rollbackCount: 0,
    totalRollbackFrames: 0,
    averageRollbackFrames: 0,
    predictionErrors: 0,
    ping: 0,
    inputDelay: 0,
  };

  private gameState: GameState | null = null;

  constructor(
    callbacks: GGPOCallbacks,
    config: Partial<GGPOConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.callbacks = callbacks;
    
    this.inputBuffer = new InputBuffer({
      inputDelay: this.config.inputDelay,
      maxBufferSize: 128,
    });
    
    this.stateManager = new StateManager({
      maxSnapshots: this.config.maxRollbackFrames + 2,
      checksumEnabled: this.config.syncTestEnabled,
    });
    
    this.stats.inputDelay = this.config.inputDelay;
  }

  initialize(initialState: GameState, localPlayerIndex: number): void {
    this.gameState = cloneGameState(initialState);
    this.localPlayerIndex = localPlayerIndex;
    this.currentFrame = 0;
    this.syncFrame = 0;
    this.sessionState = 'running';
    
    this.stateManager.saveState(0, this.gameState);
    this.inputBuffer.reset();
    
    this.resetStats();
  }

  addLocalInput(input: InputState): void {
    if (!this.gameState || this.sessionState !== 'running') return;
    
    this.inputBuffer.addLocalInput(this.currentFrame, input);
  }

  addRemoteInput(frame: number, encodedInput: number): void {
    if (this.sessionState !== 'running') return;
    
    const predictionMismatch = this.inputBuffer.addRemoteInput(frame, encodedInput);
    
    if (predictionMismatch && frame <= this.currentFrame) {
      this.stats.predictionErrors++;
      this.performRollback(frame);
    }
    
    this.stats.lastConfirmedFrame = this.inputBuffer.getLastConfirmedFrame();
  }

  advanceFrame(): GameState | null {
    if (!this.gameState || this.sessionState !== 'running') {
      return this.gameState;
    }

    const framesToSimulate = this.shouldSynchronize() ? 1 : 1;
    
    for (let i = 0; i < framesToSimulate; i++) {
      this.stateManager.saveState(this.currentFrame, this.gameState);
      this.callbacks.onSaveState(this.currentFrame);
      
      const inputs = this.inputBuffer.getInputsForFrame(
        this.currentFrame, 
        this.localPlayerIndex
      );
      
      this.gameState = this.callbacks.onAdvanceFrame(this.gameState, inputs);
      this.currentFrame++;
      this.stats.currentFrame = this.currentFrame;
    }

    this.updateSyncFrame();
    
    return this.gameState;
  }

  private performRollback(toFrame: number): void {
    if (!this.gameState) return;
    
    const rollbackFrames = this.currentFrame - toFrame;
    if (rollbackFrames > this.config.maxRollbackFrames) {
      console.warn(`Rollback too large: ${rollbackFrames} frames, max: ${this.config.maxRollbackFrames}`);
      return;
    }
    
    const savedState = this.stateManager.loadState(toFrame);
    if (!savedState) {
      console.error(`No saved state for frame ${toFrame}`);
      return;
    }

    this.callbacks.onRollback(this.currentFrame, toFrame);
    this.callbacks.onLoadState(toFrame);
    
    this.gameState = savedState;
    
    const framesToResimulate = this.currentFrame - toFrame;
    this.stats.rollbackCount++;
    this.stats.totalRollbackFrames += framesToResimulate;
    this.stats.averageRollbackFrames = this.stats.totalRollbackFrames / this.stats.rollbackCount;

    for (let frame = toFrame; frame < this.currentFrame; frame++) {
      this.stateManager.saveState(frame, this.gameState);
      
      const inputs = this.inputBuffer.getInputsForFrame(frame, this.localPlayerIndex);
      this.gameState = this.callbacks.onAdvanceFrame(this.gameState, inputs);
    }
  }

  private shouldSynchronize(): boolean {
    const unconfirmedFrames = this.currentFrame - this.inputBuffer.getLastConfirmedFrame();
    return unconfirmedFrames < this.config.maxPredictionFrames;
  }

  private updateSyncFrame(): void {
    const confirmedFrame = this.inputBuffer.getLastConfirmedFrame();
    if (confirmedFrame > this.syncFrame) {
      this.syncFrame = confirmedFrame;
    }
  }

  getPendingInputs(): Array<{ frame: number; encodedInput: number }> {
    return this.inputBuffer.getPendingInputs();
  }

  getState(): GameState | null {
    return this.gameState;
  }

  getCurrentFrame(): number {
    return this.currentFrame;
  }

  getSyncFrame(): number {
    return this.syncFrame;
  }

  getSessionState(): GGPOSessionState {
    return this.sessionState;
  }

  getStats(): GGPOStats {
    return { ...this.stats };
  }

  setInputDelay(delay: number): void {
    this.config.inputDelay = Math.max(0, Math.min(10, delay));
    this.inputBuffer.setInputDelay(delay);
    this.stats.inputDelay = delay;
  }

  setPing(ping: number): void {
    this.stats.ping = ping;
    
    const recommendedDelay = Math.ceil(ping / (1000 / 60) / 2);
    if (recommendedDelay !== this.config.inputDelay) {
      console.log(`Recommended input delay: ${recommendedDelay} (ping: ${ping}ms)`);
    }
  }

  pause(): void {
    this.sessionState = 'interrupted';
  }

  resume(): void {
    if (this.sessionState === 'interrupted') {
      this.sessionState = 'running';
    }
  }

  disconnect(): void {
    this.sessionState = 'disconnected';
    this.inputBuffer.reset();
  }

  private resetStats(): void {
    this.stats = {
      currentFrame: 0,
      lastConfirmedFrame: -1,
      rollbackCount: 0,
      totalRollbackFrames: 0,
      averageRollbackFrames: 0,
      predictionErrors: 0,
      ping: 0,
      inputDelay: this.config.inputDelay,
    };
  }

  isWaitingForInput(): boolean {
    const unconfirmedFrames = this.currentFrame - this.inputBuffer.getLastConfirmedFrame();
    return unconfirmedFrames >= this.config.maxPredictionFrames;
  }

  getFrameAdvantage(): number {
    return this.currentFrame - this.inputBuffer.getLastConfirmedFrame();
  }
}

export function createOfflineSession(
  advanceFrame: (state: GameState, inputs: [InputState, InputState]) => GameState
): GGPOSession {
  const callbacks: GGPOCallbacks = {
    onAdvanceFrame: advanceFrame,
    onSaveState: () => {},
    onLoadState: () => {},
    onRollback: () => {},
  };
  
  return new GGPOSession(callbacks, {
    inputDelay: 0,
    maxRollbackFrames: 0,
    maxPredictionFrames: 0,
  });
}
