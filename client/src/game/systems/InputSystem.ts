/**
 * Input System - Handles keyboard input for both players
 * Player 1: WASD + UIO (light punch, heavy punch, light kick) + JKL (heavy kick)
 * Player 2: Arrow Keys + Numpad 789 / 456
 */

import { InputState } from '../engine/GameState';

export interface KeyBindings {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  lightPunch: string[];
  heavyPunch: string[];
  lightKick: string[];
  heavyKick: string[];
}

export const PLAYER1_BINDINGS: KeyBindings = {
  up: ['KeyW'],
  down: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  lightPunch: ['KeyU'],
  heavyPunch: ['KeyI'],
  lightKick: ['KeyJ'],
  heavyKick: ['KeyK'],
};

export const PLAYER2_BINDINGS: KeyBindings = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  lightPunch: ['Numpad7'],
  heavyPunch: ['Numpad8'],
  lightKick: ['Numpad4'],
  heavyKick: ['Numpad5'],
};

export class InputSystem {
  private keysPressed: Set<string> = new Set();
  private player1Bindings: KeyBindings;
  private player2Bindings: KeyBindings;
  private isListening: boolean = false;

  constructor(
    player1Bindings: KeyBindings = PLAYER1_BINDINGS,
    player2Bindings: KeyBindings = PLAYER2_BINDINGS
  ) {
    this.player1Bindings = player1Bindings;
    this.player2Bindings = player2Bindings;
  }

  start(): void {
    if (this.isListening) return;
    
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    this.isListening = true;
  }

  stop(): void {
    if (!this.isListening) return;
    
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.keysPressed.clear();
    this.isListening = false;
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    this.keysPressed.add(e.code);
    
    if (this.shouldPreventDefault(e.code)) {
      e.preventDefault();
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keysPressed.delete(e.code);
  };

  private handleBlur = (): void => {
    this.keysPressed.clear();
  };

  private shouldPreventDefault(code: string): boolean {
    const allBindings = [
      ...Object.values(this.player1Bindings).flat(),
      ...Object.values(this.player2Bindings).flat(),
    ];
    return allBindings.includes(code);
  }

  private isKeyPressed(keys: string[]): boolean {
    return keys.some(key => this.keysPressed.has(key));
  }

  private getInputFromBindings(bindings: KeyBindings): InputState {
    return {
      up: this.isKeyPressed(bindings.up),
      down: this.isKeyPressed(bindings.down),
      left: this.isKeyPressed(bindings.left),
      right: this.isKeyPressed(bindings.right),
      lightPunch: this.isKeyPressed(bindings.lightPunch),
      heavyPunch: this.isKeyPressed(bindings.heavyPunch),
      lightKick: this.isKeyPressed(bindings.lightKick),
      heavyKick: this.isKeyPressed(bindings.heavyKick),
    };
  }

  getPlayer1Input(): InputState {
    return this.getInputFromBindings(this.player1Bindings);
  }

  getPlayer2Input(): InputState {
    return this.getInputFromBindings(this.player2Bindings);
  }

  getInput(playerIndex: number): InputState {
    if (playerIndex === 0) {
      return this.getPlayer1Input();
    } else {
      return this.getPlayer2Input();
    }
  }

  setBindings(player1: KeyBindings, player2: KeyBindings): void {
    this.player1Bindings = player1;
    this.player2Bindings = player2;
  }

  getBindings(): { player1: KeyBindings; player2: KeyBindings } {
    return {
      player1: this.player1Bindings,
      player2: this.player2Bindings,
    };
  }

  isAnyKeyPressed(): boolean {
    return this.keysPressed.size > 0;
  }

  clearInput(): void {
    this.keysPressed.clear();
  }
}

export function encodeInput(input: InputState): number {
  let encoded = 0;
  if (input.up) encoded |= 1 << 0;
  if (input.down) encoded |= 1 << 1;
  if (input.left) encoded |= 1 << 2;
  if (input.right) encoded |= 1 << 3;
  if (input.lightPunch) encoded |= 1 << 4;
  if (input.heavyPunch) encoded |= 1 << 5;
  if (input.lightKick) encoded |= 1 << 6;
  if (input.heavyKick) encoded |= 1 << 7;
  return encoded;
}

export function decodeInput(encoded: number): InputState {
  return {
    up: (encoded & (1 << 0)) !== 0,
    down: (encoded & (1 << 1)) !== 0,
    left: (encoded & (1 << 2)) !== 0,
    right: (encoded & (1 << 3)) !== 0,
    lightPunch: (encoded & (1 << 4)) !== 0,
    heavyPunch: (encoded & (1 << 5)) !== 0,
    lightKick: (encoded & (1 << 6)) !== 0,
    heavyKick: (encoded & (1 << 7)) !== 0,
  };
}

export function hasAnyInput(input: InputState): boolean {
  return (
    input.up
    || input.down
    || input.left
    || input.right
    || input.lightPunch
    || input.heavyPunch
    || input.lightKick
    || input.heavyKick
  );
}

export function inputsEqual(a: InputState, b: InputState): boolean {
  return (
    a.up === b.up &&
    a.down === b.down &&
    a.left === b.left &&
    a.right === b.right &&
    a.lightPunch === b.lightPunch &&
    a.heavyPunch === b.heavyPunch &&
    a.lightKick === b.lightKick &&
    a.heavyKick === b.heavyKick
  );
}

export function wasJustPressed(current: InputState, previous: InputState): InputState {
  return {
    up: current.up && !previous.up,
    down: current.down && !previous.down,
    left: current.left && !previous.left,
    right: current.right && !previous.right,
    lightPunch: current.lightPunch && !previous.lightPunch,
    heavyPunch: current.heavyPunch && !previous.heavyPunch,
    lightKick: current.lightKick && !previous.lightKick,
    heavyKick: current.heavyKick && !previous.heavyKick,
  };
}
