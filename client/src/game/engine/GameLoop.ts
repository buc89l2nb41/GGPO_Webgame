/**
 * Fixed Timestep Game Loop
 * Ensures deterministic simulation at 60 FPS regardless of actual frame rate
 */

import { GameState, cloneGameState, InputState } from './GameState';
import { Renderer } from './Renderer';

export const FRAME_RATE = 60;
export const FRAME_TIME_MS = 1000 / FRAME_RATE;
export const MAX_FRAME_SKIP = 5;

export type UpdateFunction = (state: GameState, inputs: [InputState, InputState]) => GameState;
export type InputProvider = (playerIndex: number) => InputState;

export interface GameLoopStats {
  fps: number;
  frameTime: number;
  simulationTime: number;
  renderTime: number;
  framesSkipped: number;
}

export class GameLoop {
  private state: GameState;
  private renderer: Renderer;
  private updateFn: UpdateFunction;
  private inputProvider: InputProvider;
  
  private isRunning: boolean = false;
  private animationFrameId: number | null = null;
  private lastTime: number = 0;
  private accumulator: number = 0;
  
  private stats: GameLoopStats = {
    fps: 0,
    frameTime: 0,
    simulationTime: 0,
    renderTime: 0,
    framesSkipped: 0,
  };
  
  private fpsFrames: number = 0;
  private fpsLastTime: number = 0;
  
  private onStateChange?: (state: GameState) => void;

  constructor(
    initialState: GameState,
    renderer: Renderer,
    updateFn: UpdateFunction,
    inputProvider: InputProvider
  ) {
    this.state = cloneGameState(initialState);
    this.renderer = renderer;
    this.updateFn = updateFn;
    this.inputProvider = inputProvider;
  }

  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.lastTime = performance.now();
    this.fpsLastTime = this.lastTime;
    this.accumulator = 0;
    
    this.loop();
  }

  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  pause(): void {
    this.state.isPaused = true;
  }

  resume(): void {
    this.state.isPaused = false;
    this.lastTime = performance.now();
    this.accumulator = 0;
  }

  isPaused(): boolean {
    return this.state.isPaused;
  }

  private loop = (): void => {
    if (!this.isRunning) return;
    
    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;
    
    this.stats.frameTime = deltaTime;
    
    this.updateFPS(currentTime);
    
    if (!this.state.isPaused) {
      const simStart = performance.now();
      this.accumulator += deltaTime;
      
      let framesSimulated = 0;
      while (this.accumulator >= FRAME_TIME_MS && framesSimulated < MAX_FRAME_SKIP) {
        const inputs: [InputState, InputState] = [
          this.inputProvider(0),
          this.inputProvider(1),
        ];
        
        this.state = this.updateFn(this.state, inputs);
        
        if (this.onStateChange) {
          this.onStateChange(this.state);
        }
        
        this.accumulator -= FRAME_TIME_MS;
        framesSimulated++;
      }
      
      this.stats.simulationTime = performance.now() - simStart;
      this.stats.framesSkipped = Math.max(0, framesSimulated - 1);
      
      if (this.accumulator > FRAME_TIME_MS * MAX_FRAME_SKIP) {
        this.accumulator = 0;
      }
    }
    
    const renderStart = performance.now();
    this.renderer.render(this.state);
    this.stats.renderTime = performance.now() - renderStart;
    
    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  private updateFPS(currentTime: number): void {
    this.fpsFrames++;
    const elapsed = currentTime - this.fpsLastTime;
    
    if (elapsed >= 1000) {
      this.stats.fps = Math.round((this.fpsFrames * 1000) / elapsed);
      this.fpsFrames = 0;
      this.fpsLastTime = currentTime;
    }
  }

  getState(): GameState {
    return this.state;
  }

  setState(state: GameState): void {
    this.state = cloneGameState(state);
  }

  getStats(): GameLoopStats {
    return { ...this.stats };
  }

  setOnStateChange(callback: (state: GameState) => void): void {
    this.onStateChange = callback;
  }

  simulateFrame(inputs: [InputState, InputState]): GameState {
    this.state = this.updateFn(this.state, inputs);
    return this.state;
  }

  rollbackTo(state: GameState): void {
    this.state = cloneGameState(state);
  }

  resimulate(savedState: GameState, inputHistory: Array<[InputState, InputState]>): GameState {
    let state = cloneGameState(savedState);
    
    for (const inputs of inputHistory) {
      state = this.updateFn(state, inputs);
    }
    
    this.state = state;
    return state;
  }
}

export function createDefaultInputProvider(): InputProvider {
  return () => ({
    up: false,
    down: false,
    left: false,
    right: false,
    lightPunch: false,
    heavyPunch: false,
    lightKick: false,
    heavyKick: false,
  });
}
