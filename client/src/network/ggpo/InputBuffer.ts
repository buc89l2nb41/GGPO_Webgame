/**
 * Input Buffer - Manages input history for rollback netcode
 * Stores local and remote inputs, handles input prediction
 */

import { InputState, DEFAULT_INPUT } from '../../game/engine/GameState';
import { encodeInput, decodeInput, inputsEqual } from '../../game/systems/InputSystem';

export interface FrameInput {
  frame: number;
  input: InputState;
  predicted: boolean;
  confirmed: boolean;
}

export interface InputBufferConfig {
  maxBufferSize: number;
  inputDelay: number;
}

const DEFAULT_CONFIG: InputBufferConfig = {
  maxBufferSize: 128,
  inputDelay: 2,
};

export class InputBuffer {
  private localInputs: Map<number, FrameInput> = new Map();
  private remoteInputs: Map<number, FrameInput> = new Map();
  private config: InputBufferConfig;
  private lastConfirmedFrame: number = -1;
  private lastPredictedFrame: number = -1;
  private pendingInputs: Array<{ frame: number; encodedInput: number }> = [];

  constructor(config: Partial<InputBufferConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  addLocalInput(frame: number, input: InputState): void {
    const delayedFrame = frame + this.config.inputDelay;
    
    this.localInputs.set(delayedFrame, {
      frame: delayedFrame,
      input: { ...input },
      predicted: false,
      confirmed: true,
    });

    this.pendingInputs.push({
      frame: delayedFrame,
      encodedInput: encodeInput(input),
    });

    this.cleanupOldInputs();
  }

  addRemoteInput(frame: number, encodedInput: number): boolean {
    const input = decodeInput(encodedInput);
    const existing = this.remoteInputs.get(frame);
    
    let predictionMismatch = false;
    
    if (existing && existing.predicted) {
      predictionMismatch = !inputsEqual(existing.input, input);
    }

    this.remoteInputs.set(frame, {
      frame,
      input,
      predicted: false,
      confirmed: true,
    });

    if (frame > this.lastConfirmedFrame) {
      this.lastConfirmedFrame = frame;
    }

    return predictionMismatch;
  }

  getLocalInput(frame: number): InputState {
    const frameInput = this.localInputs.get(frame);
    if (frameInput) {
      return frameInput.input;
    }
    
    return this.predictInput(this.localInputs, frame);
  }

  getRemoteInput(frame: number): InputState {
    const frameInput = this.remoteInputs.get(frame);
    if (frameInput && frameInput.confirmed) {
      return frameInput.input;
    }

    const predicted = this.predictInput(this.remoteInputs, frame);
    
    if (!this.remoteInputs.has(frame)) {
      this.remoteInputs.set(frame, {
        frame,
        input: predicted,
        predicted: true,
        confirmed: false,
      });
      
      if (frame > this.lastPredictedFrame) {
        this.lastPredictedFrame = frame;
      }
    }

    return predicted;
  }

  getInputsForFrame(frame: number, localPlayerIndex: number): [InputState, InputState] {
    const localInput = this.getLocalInput(frame);
    const remoteInput = this.getRemoteInput(frame);
    
    if (localPlayerIndex === 0) {
      return [localInput, remoteInput];
    } else {
      return [remoteInput, localInput];
    }
  }

  private predictInput(inputs: Map<number, FrameInput>, frame: number): InputState {
    let lastInput: InputState = { ...DEFAULT_INPUT };
    let lastFrame = -1;

    for (const [f, frameInput] of inputs) {
      if (f <= frame && f > lastFrame && frameInput.confirmed) {
        lastInput = frameInput.input;
        lastFrame = f;
      }
    }

    return { ...lastInput };
  }

  getPendingInputs(): Array<{ frame: number; encodedInput: number }> {
    const pending = [...this.pendingInputs];
    this.pendingInputs = [];
    return pending;
  }

  hasPendingInputs(): boolean {
    return this.pendingInputs.length > 0;
  }

  getLastConfirmedFrame(): number {
    return this.lastConfirmedFrame;
  }

  getLastPredictedFrame(): number {
    return this.lastPredictedFrame;
  }

  isFrameConfirmed(frame: number): boolean {
    const remote = this.remoteInputs.get(frame);
    return remote !== undefined && remote.confirmed;
  }

  getFirstUnconfirmedFrame(): number {
    for (let frame = 0; frame <= this.lastPredictedFrame; frame++) {
      const remote = this.remoteInputs.get(frame);
      if (!remote || !remote.confirmed) {
        return frame;
      }
    }
    return this.lastPredictedFrame + 1;
  }

  setInputDelay(delay: number): void {
    this.config.inputDelay = Math.max(0, Math.min(10, delay));
  }

  getInputDelay(): number {
    return this.config.inputDelay;
  }

  private cleanupOldInputs(): void {
    const minFrame = Math.max(0, this.lastConfirmedFrame - this.config.maxBufferSize);
    
    for (const [frame] of this.localInputs) {
      if (frame < minFrame) {
        this.localInputs.delete(frame);
      }
    }
    
    for (const [frame] of this.remoteInputs) {
      if (frame < minFrame) {
        this.remoteInputs.delete(frame);
      }
    }
  }

  reset(): void {
    this.localInputs.clear();
    this.remoteInputs.clear();
    this.pendingInputs = [];
    this.lastConfirmedFrame = -1;
    this.lastPredictedFrame = -1;
  }

  getStats(): { localCount: number; remoteCount: number; pendingCount: number } {
    return {
      localCount: this.localInputs.size,
      remoteCount: this.remoteInputs.size,
      pendingCount: this.pendingInputs.length,
    };
  }
}
