/**
 * State Manager - Handles game state snapshots for rollback
 * Saves and restores game state for rollback netcode
 */

import { 
  GameState, 
  cloneGameState, 
  serializeGameState, 
  deserializeGameState 
} from '../../game/engine/GameState';

export interface StateSnapshot {
  frame: number;
  state: GameState;
  checksum: number;
}

export interface StateManagerConfig {
  maxSnapshots: number;
  checksumEnabled: boolean;
}

const DEFAULT_CONFIG: StateManagerConfig = {
  maxSnapshots: 10,
  checksumEnabled: true,
};

export class StateManager {
  private snapshots: Map<number, StateSnapshot> = new Map();
  private config: StateManagerConfig;

  constructor(config: Partial<StateManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  saveState(frame: number, state: GameState): void {
    const snapshot: StateSnapshot = {
      frame,
      state: cloneGameState(state),
      checksum: this.config.checksumEnabled ? this.calculateChecksum(state) : 0,
    };

    this.snapshots.set(frame, snapshot);
    this.cleanupOldSnapshots(frame);
  }

  loadState(frame: number): GameState | null {
    const snapshot = this.snapshots.get(frame);
    if (!snapshot) {
      return null;
    }

    return cloneGameState(snapshot.state);
  }

  getClosestSnapshot(frame: number): StateSnapshot | null {
    let closest: StateSnapshot | null = null;
    let closestDiff = Infinity;

    for (const [f, snapshot] of this.snapshots) {
      if (f <= frame) {
        const diff = frame - f;
        if (diff < closestDiff) {
          closestDiff = diff;
          closest = snapshot;
        }
      }
    }

    return closest;
  }

  hasSnapshot(frame: number): boolean {
    return this.snapshots.has(frame);
  }

  getChecksum(frame: number): number | null {
    const snapshot = this.snapshots.get(frame);
    return snapshot ? snapshot.checksum : null;
  }

  verifyChecksum(frame: number, state: GameState): boolean {
    const snapshot = this.snapshots.get(frame);
    if (!snapshot || !this.config.checksumEnabled) {
      return true;
    }

    const currentChecksum = this.calculateChecksum(state);
    return currentChecksum === snapshot.checksum;
  }

  private calculateChecksum(state: GameState): number {
    const serialized = serializeGameState(state);
    return this.hashString(serialized);
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  private cleanupOldSnapshots(currentFrame: number): void {
    const minFrame = currentFrame - this.config.maxSnapshots;
    
    for (const [frame] of this.snapshots) {
      if (frame < minFrame) {
        this.snapshots.delete(frame);
      }
    }

  }

  getOldestFrame(): number {
    let oldest = Infinity;
    for (const [frame] of this.snapshots) {
      if (frame < oldest) {
        oldest = frame;
      }
    }
    return oldest === Infinity ? 0 : oldest;
  }

  getNewestFrame(): number {
    let newest = -1;
    for (const [frame] of this.snapshots) {
      if (frame > newest) {
        newest = frame;
      }
    }
    return newest;
  }

  getSnapshotCount(): number {
    return this.snapshots.size;
  }

  reset(): void {
    this.snapshots.clear();
  }

  exportSnapshot(frame: number): string | null {
    const snapshot = this.snapshots.get(frame);
    if (!snapshot) {
      return null;
    }

    return JSON.stringify({
      frame: snapshot.frame,
      state: serializeGameState(snapshot.state),
      checksum: snapshot.checksum,
    });
  }

  importSnapshot(data: string): boolean {
    try {
      const parsed = JSON.parse(data);
      const state = deserializeGameState(parsed.state);
      
      this.snapshots.set(parsed.frame, {
        frame: parsed.frame,
        state,
        checksum: parsed.checksum,
      });
      
      return true;
    } catch {
      return false;
    }
  }

  getStats(): { count: number; oldestFrame: number; newestFrame: number } {
    return {
      count: this.snapshots.size,
      oldestFrame: this.getOldestFrame(),
      newestFrame: this.getNewestFrame(),
    };
  }
}
