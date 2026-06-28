/**
 * Fighting-game motion input detection (relative to facing).
 */

import { InputState, RelativeDirection } from '../engine/GameState';

export type { RelativeDirection };

export function getRelativeDirection(input: InputState, facingRight: boolean): RelativeDirection {
  const forward = facingRight ? input.right : input.left;
  const back = facingRight ? input.left : input.right;
  const down = input.down;
  const up = input.up;

  if (down && forward) return 'DF';
  if (down && back) return 'DB';
  if (up && forward) return 'UF';
  if (up && back) return 'UB';
  if (down) return 'D';
  if (up) return 'N';
  if (forward) return 'F';
  if (back) return 'B';
  return 'N';
}

export function pushDirectionHistory(
  history: RelativeDirection[],
  dir: RelativeDirection,
  maxLength: number,
): RelativeDirection[] {
  const next = history.length >= maxLength ? history.slice(history.length - maxLength + 1) : [...history];
  next.push(dir);
  return next;
}

function compressHistory(history: RelativeDirection[]): RelativeDirection[] {
  const result: RelativeDirection[] = [];
  for (const dir of history) {
    if (result.length === 0 || result[result.length - 1] !== dir) {
      result.push(dir);
    }
  }
  return result;
}

/** Quarter-circle forward (236 / 장풍): ↓ → ↘ → → */
export function matchesHadouken(history: RelativeDirection[]): boolean {
  const seq = compressHistory(history);
  let i = 0;

  while (i < seq.length && seq[i] !== 'D' && seq[i] !== 'DF') {
    i++;
  }
  if (i >= seq.length) {
    return false;
  }

  i++;
  while (i < seq.length && seq[i] === 'N') {
    i++;
  }
  if (i >= seq.length) {
    return false;
  }

  if (seq[i] === 'F') {
    return true;
  }

  if (seq[i] === 'DF') {
    i++;
    while (i < seq.length && seq[i] === 'N') {
      i++;
    }
    return i < seq.length && seq[i] === 'F';
  }

  if (seq[i] === 'D') {
    i++;
    while (i < seq.length && seq[i] === 'N') {
      i++;
    }
    return i < seq.length && (seq[i] === 'DF' || seq[i] === 'F');
  }

  return false;
}

/** Looser 236 for special cancels — ↓ then → is enough (↘ optional). */
export function matchesHadoukenLenient(history: RelativeDirection[]): boolean {
  if (matchesHadouken(history)) {
    return true;
  }

  const seq = compressHistory(history);
  let i = 0;
  while (i < seq.length && seq[i] !== 'D' && seq[i] !== 'DF') {
    i++;
  }
  if (i >= seq.length) {
    return false;
  }

  i++;
  while (i < seq.length) {
    const dir = seq[i];
    if (dir === 'N' || dir === 'D') {
      i++;
      continue;
    }
    return dir === 'F' || dir === 'DF';
  }
  return false;
}

/**
 * SF/KOF-style special-cancel motion check.
 * Crouch stance implies the ↓ of 236 — still requires ↘/→ in the buffer.
 */
export function buildSpecialCancelMotionHistory(
  history: RelativeDirection[],
  options: { implyCrouchDown: boolean },
): RelativeDirection[] {
  if (!options.implyCrouchDown) {
    return history;
  }

  const seq = compressHistory(history);
  if (seq.some((dir) => dir === 'D' || dir === 'DF')) {
    return history;
  }

  return ['D', ...history];
}

export function matchesSpecialCancelMotion(
  history: RelativeDirection[],
  options: { implyCrouchDown: boolean },
): boolean {
  const motionHistory = buildSpecialCancelMotionHistory(history, options);
  return matchesHadoukenLenient(motionHistory) || matchesHadouken(motionHistory);
}

export function hasAttackButtonPressed(input: InputState): boolean {
  return input.lightPunch || input.heavyPunch || input.lightKick || input.heavyKick;
}
