/**
 * Jump tuning — all long jumps have the same height, hops are half.
 * Horizontal travel distance is based on stage width ratios.
 */

import { AirJumpKind, GAME_CONFIG } from './GameState';

type JumpDirection = 'neutral' | 'forward' | 'backward';

const JUMP_TRAVEL_RATIO: Record<AirJumpKind, number> = {
  normal: GAME_CONFIG.JUMP_TRAVEL_RATIO_NORMAL,
  hyper_jump: GAME_CONFIG.JUMP_TRAVEL_RATIO_HYPER_JUMP,
  hop: GAME_CONFIG.JUMP_TRAVEL_RATIO_HOP,
  hyper_hop: GAME_CONFIG.JUMP_TRAVEL_RATIO_HYPER_HOP,
};

function simulateApexHeight(initialVy: number): number {
  let vy = initialVy;
  let y = 0;
  let minY = 0;

  for (let frame = 0; frame < 300; frame++) {
    y += vy;
    minY = Math.min(minY, y);
    const gravity = vy < 0 ? GAME_CONFIG.GRAVITY_RISE : GAME_CONFIG.GRAVITY_FALL;
    vy += gravity;
    if (y >= 0 && vy > 0) {
      break;
    }
  }

  return -minY;
}

function simulateAirtime(initialVy: number): number {
  let vy = initialVy;
  let y = 0;

  for (let frame = 0; frame < 300; frame++) {
    y += vy;
    const gravity = vy < 0 ? GAME_CONFIG.GRAVITY_RISE : GAME_CONFIG.GRAVITY_FALL;
    vy += gravity;
    if (y >= 0 && vy > 0) {
      return frame + 1;
    }
  }

  return 1;
}

// Hop vertical force = sqrt(0.5) × full force → half the apex height
function getHopVerticalForce(): number {
  const ratio = Math.sqrt(GAME_CONFIG.JUMP_HOP_HEIGHT_RATIO);
  return Math.round(GAME_CONFIG.JUMP_FORCE_FULL * ratio);
}

const HOP_FORCE = getHopVerticalForce();

/**
 * Get vertical jump velocity.
 * - All long jumps (normal, hyper_jump) use JUMP_FORCE_FULL regardless of direction.
 * - All hops (hop, hyper_hop) use HOP_FORCE (half height).
 */
export function getVerticalJumpVelocity(kind: AirJumpKind, _direction: JumpDirection): number {
  if (kind === 'hop' || kind === 'hyper_hop') {
    return HOP_FORCE;
  }
  return GAME_CONFIG.JUMP_FORCE_FULL;
}

function buildHorizontalSpeeds(): Record<AirJumpKind, Record<JumpDirection, number>> {
  const kinds: AirJumpKind[] = ['normal', 'hyper_jump', 'hop', 'hyper_hop'];
  const directions: JumpDirection[] = ['neutral', 'forward', 'backward'];
  const speeds = {} as Record<AirJumpKind, Record<JumpDirection, number>>;

  for (const kind of kinds) {
    speeds[kind] = { neutral: 0, forward: 0, backward: 0 };
    // Jump distance is based on viewport (visible screen), not full stage
    const targetDistance = GAME_CONFIG.VIEWPORT_WIDTH * JUMP_TRAVEL_RATIO[kind];

    for (const direction of directions) {
      if (direction === 'neutral') continue;
      const verticalVelocity = getVerticalJumpVelocity(kind, direction);
      const airtime = simulateAirtime(verticalVelocity);
      speeds[kind][direction] = Math.round(targetDistance / airtime);
    }
  }

  return speeds;
}

const JUMP_HORIZONTAL_SPEED = buildHorizontalSpeeds();

export function getHorizontalJumpSpeed(kind: AirJumpKind, direction: JumpDirection): number {
  if (direction === 'neutral') {
    return 0;
  }
  return JUMP_HORIZONTAL_SPEED[kind][direction];
}

/** Backdash uses hop tuning with reduced apex (height ∝ vy²). */
export function getBackDashVerticalVelocity(): number {
  const hopVy = getVerticalJumpVelocity('hop', 'backward');
  return Math.round(hopVy * Math.sqrt(GAME_CONFIG.BACKDASH_JUMP_HEIGHT_RATIO));
}

export function getFullJumpApexHeight(): number {
  return simulateApexHeight(GAME_CONFIG.JUMP_FORCE_FULL);
}

export function getShortHopApexHeight(): number {
  return simulateApexHeight(HOP_FORCE);
}

/** Low arc for dropkick (SPECIAL_1). */
export function getDropkickVerticalVelocity(): number {
  return Math.round(GAME_CONFIG.JUMP_FORCE_FULL * Math.sqrt(GAME_CONFIG.DROPKICK_HEIGHT_RATIO));
}

/** Forward speed tuned to travel ~half the stage over the full dropkick. */
export function getDropkickHorizontalSpeed(
  startup: number,
  active: number,
  recovery: number,
): number {
  const targetDistance = GAME_CONFIG.STAGE_WIDTH * GAME_CONFIG.DROPKICK_TRAVEL_RATIO;
  const weightedFrames = startup * 0.85 + active + recovery * 0.68;
  return Math.round(targetDistance / weightedFrames);
}
