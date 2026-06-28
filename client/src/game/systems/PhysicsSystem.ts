/**
 * Physics System - Handles movement, gravity, and basic collisions
 */

import { 
  GameState, 
  PlayerState, 
  GAME_CONFIG, 
  CharacterState,
  Box,
  Projectile,
} from '../engine/GameState';
import { BASE_CHARACTER, getPushbox } from '../data/characters/BaseCharacter';

export function applyPhysics(state: GameState): GameState {
  const newState = { ...state };

  const p0Result = applyPlayerPhysics(state.players[0], state.players[1]);
  const p1Result = applyPlayerPhysics(state.players[1], state.players[0]);

  let p0 = p0Result.player;
  let p1 = p1Result.player;

  if (p0Result.opponentPushX !== 0) {
    p1 = {
      ...p1,
      position: {
        ...p1.position,
        x: clampPlayerStageX(p1.position.x + p0Result.opponentPushX),
      },
    };
  }
  if (p1Result.opponentPushX !== 0) {
    p0 = {
      ...p0,
      position: {
        ...p0.position,
        x: clampPlayerStageX(p0.position.x + p1Result.opponentPushX),
      },
    };
  }

  newState.players = [p0, p1];

  resolvePushCollision(newState.players[0], newState.players[1]);
  
  newState.projectiles = state.projectiles.map(applyProjectilePhysics).filter(p => p.active);
  
  return newState;
}

interface PlayerPhysicsResult {
  player: PlayerState;
  /** Push applied to the opponent when this player is cornered during knockback */
  opponentPushX: number;
}

function applyPlayerPhysics(player: PlayerState, opponent: PlayerState): PlayerPhysicsResult {
  const newPlayer = { ...player };
  let opponentPushX = 0;
  const inAir = newPlayer.position.y < GAME_CONFIG.GROUND_Y;

  if (inAir) {
    const gravity = newPlayer.velocity.y < 0
      ? GAME_CONFIG.GRAVITY_RISE
      : GAME_CONFIG.GRAVITY_FALL;
    newPlayer.velocity = {
      ...newPlayer.velocity,
      y: newPlayer.velocity.y + gravity,
    };
  }
  
  newPlayer.position = {
    x: newPlayer.position.x,
    y: newPlayer.position.y + newPlayer.velocity.y,
  };
  
  if (newPlayer.position.y >= GAME_CONFIG.GROUND_Y) {
    newPlayer.position.y = GAME_CONFIG.GROUND_Y;
    newPlayer.velocity.y = 0;
    newPlayer.isGrounded = true;
  } else {
    newPlayer.isGrounded = false;
  }

  const prevX = newPlayer.position.x;
  const intendedVx = newPlayer.velocity.x;
  let clampedX = clampPlayerStageX(prevX + intendedVx);

  if (shouldClampRetreatToViewport(newPlayer, intendedVx)) {
    clampedX = clampBackwardToViewport(newPlayer, opponent, clampedX);
  }

  if (newPlayer.state === CharacterState.SPECIAL_1 && intendedVx !== 0) {
    const blockedX = clampDropkickForwardX(newPlayer, opponent, prevX, clampedX);
    if (blockedX !== clampedX) {
      clampedX = blockedX;
      newPlayer.velocity.x = 0;
    }
  }

  const movedX = clampedX - prevX;
  const overflowX = intendedVx - movedX;

  newPlayer.position.x = clampedX;

  if (
    overflowX !== 0
    && (newPlayer.hitstun > 0 || newPlayer.blockstun > 0)
  ) {
    opponentPushX = -overflowX;
    newPlayer.velocity.x = 0;
  } else if (movedX === 0) {
    newPlayer.velocity.x = 0;
  }
  
  return { player: newPlayer, opponentPushX };
}

function applyProjectilePhysics(projectile: Projectile): Projectile {
  if (!projectile.active) return projectile;
  
  const newProjectile = {
    ...projectile,
    position: {
      x: projectile.position.x + projectile.velocity.x,
      y: projectile.position.y + projectile.velocity.y,
    },
    lifetime: projectile.lifetime - 1,
  };
  
  if (
    newProjectile.position.x < 0 ||
    newProjectile.position.x > GAME_CONFIG.STAGE_WIDTH ||
    newProjectile.lifetime <= 0
  ) {
    newProjectile.active = false;
  }
  
  return newProjectile;
}

function pushPlayerX(player: PlayerState, delta: number): number {
  const before = player.position.x;
  player.position.x = clampPlayerStageX(before + delta);
  return delta - (player.position.x - before);
}

/** Dropkick still pushes against a hitstun opponent; other stun pairs use knockback only. */
function shouldResolvePushBetween(player1: PlayerState, player2: PlayerState): boolean {
  if (
    player1.state === CharacterState.SPECIAL_1
    || player2.state === CharacterState.SPECIAL_1
  ) {
    return true;
  }

  return (
    player1.hitstun <= 0
    && player1.blockstun <= 0
    && player2.hitstun <= 0
    && player2.blockstun <= 0
  );
}

/** Prevent dropkick from tunneling through the opponent's pushbox. */
function clampDropkickForwardX(
  player: PlayerState,
  opponent: PlayerState,
  fromX: number,
  toX: number,
): number {
  const movingForward = player.facingRight ? toX > fromX : toX < fromX;
  if (!movingForward) {
    return toX;
  }

  const probe: PlayerState = {
    ...player,
    position: { ...player.position, x: toX },
  };
  const playerBox = getPlayerPushBox(probe);
  const oppBox = getPlayerPushBox(opponent);

  if (!boxesOverlap(playerBox, oppBox)) {
    return toX;
  }

  const halfW = GAME_CONFIG.PUSH_BOX_WIDTH / 2;
  if (player.facingRight) {
    return Math.min(toX, oppBox.x - halfW);
  }
  return Math.max(toX, oppBox.x + oppBox.width + halfW);
}

function resolvePushCollision(player1: PlayerState, player2: PlayerState): void {
  if (!shouldResolvePushBetween(player1, player2)) {
    return;
  }

  const box1 = getPlayerPushBox(player1);
  const box2 = getPlayerPushBox(player2);
  
  if (!boxesOverlap(box1, box2)) return;

  const overlap = getOverlap(box1, box2);

  if (overlap.x <= 0 || overlap.y <= 0) return;
  
  const separation = overlap.x;

  if (player1.position.x <= player2.position.x) {
    const leftHalf = Math.ceil(separation / 2);
    const leftOverflow = pushPlayerX(player1, -leftHalf);
    const rightOverflow = pushPlayerX(player2, separation - leftHalf - leftOverflow);
    if (rightOverflow !== 0) {
      pushPlayerX(player1, -rightOverflow);
    }
  } else {
    const rightHalf = Math.ceil(separation / 2);
    const rightOverflow = pushPlayerX(player2, -rightHalf);
    const leftOverflow = pushPlayerX(player1, separation - rightHalf - rightOverflow);
    if (leftOverflow !== 0) {
      pushPlayerX(player2, -leftOverflow);
    }
  }
}

export function clampPlayerStageX(x: number): number {
  const halfWidth = GAME_CONFIG.PUSH_BOX_WIDTH / 2;
  return Math.max(halfWidth, Math.min(GAME_CONFIG.STAGE_WIDTH - halfWidth, x));
}

/** Camera X from player midpoint — matches Renderer.updateCamera */
export function getCameraX(p1x: number, p2x: number): number {
  const midX = (p1x + p2x) / 2;
  const targetCameraX = midX - GAME_CONFIG.VIEWPORT_WIDTH / 2;
  const minCameraX = 0;
  const maxCameraX = GAME_CONFIG.STAGE_WIDTH - GAME_CONFIG.VIEWPORT_WIDTH;
  return Math.max(minCameraX, Math.min(maxCameraX, targetCameraX));
}

function isMovingBackward(player: PlayerState, velocityX: number): boolean {
  if (velocityX === 0) {
    return false;
  }
  return player.facingRight ? velocityX < 0 : velocityX > 0;
}

function shouldClampRetreatToViewport(player: PlayerState, velocityX: number): boolean {
  if (player.hitstun > 0 || player.blockstun > 0) {
    return false;
  }
  return isMovingBackward(player, velocityX);
}

/** Keep voluntary retreats inside the visible viewport (angled play area). */
function clampBackwardToViewport(
  player: PlayerState,
  opponent: PlayerState,
  x: number,
): number {
  const cameraX = getCameraX(player.position.x, opponent.position.x);
  const halfWidth = GAME_CONFIG.PUSH_BOX_WIDTH / 2;
  const minX = cameraX + halfWidth;
  const maxX = cameraX + GAME_CONFIG.VIEWPORT_WIDTH - halfWidth;

  if (player.facingRight) {
    return Math.max(x, minX);
  }
  return Math.min(x, maxX);
}

/**
 * Push defender by knockback distance. If they cannot move the full amount
 * (corner), push the attacker back by the full knockback distance.
 */
export function applyKnockbackWithCornerPush(
  attacker: PlayerState,
  defender: PlayerState,
  pushAmount: number,
  velocityPush = 0,
): [PlayerState, PlayerState] {
  if (pushAmount <= 0) {
    return [attacker, defender];
  }

  const pushDir = attacker.facingRight ? 1 : -1;
  const signedPush = pushDir * pushAmount;

  const clampedDefenderX = clampPlayerStageX(defender.position.x + signedPush);
  const defenderAbsMoved = Math.abs(clampedDefenderX - defender.position.x);

  const newDefender: PlayerState = {
    ...defender,
    position: { ...defender.position, x: clampedDefenderX },
  };

  if (defenderAbsMoved >= pushAmount) {
    return [attacker, newDefender];
  }

  const attackerRetreat = pushAmount;
  const attackerDelta = -pushDir * attackerRetreat;

  const newAttacker: PlayerState = {
    ...attacker,
    position: {
      ...attacker.position,
      x: clampPlayerStageX(attacker.position.x + attackerDelta),
    },
    velocity: {
      ...attacker.velocity,
      x: velocityPush > 0 ? -pushDir * velocityPush : 0,
    },
  };

  return [newAttacker, newDefender];
}

export function getPlayerPushBox(player: PlayerState): Box {
  return getPushbox(BASE_CHARACTER, player.state, player.position);
}

export function isCrouchingState(state: CharacterState): boolean {
  return [
    CharacterState.CROUCH,
    CharacterState.CROUCH_GUARD,
    CharacterState.CROUCH_LIGHT_PUNCH,
    CharacterState.CROUCH_HEAVY_PUNCH,
    CharacterState.CROUCH_LIGHT_KICK,
    CharacterState.CROUCH_HEAVY_KICK,
  ].includes(state);
}

export function isAirborneState(state: CharacterState): boolean {
  return [
    CharacterState.JUMP_START,
    CharacterState.JUMP_UP,
    CharacterState.JUMP_FORWARD,
    CharacterState.JUMP_BACKWARD,
    CharacterState.JUMP_FALL,
    CharacterState.JUMP_LIGHT_PUNCH,
    CharacterState.JUMP_HEAVY_PUNCH,
    CharacterState.JUMP_LIGHT_KICK,
    CharacterState.JUMP_HEAVY_KICK,
    CharacterState.DASH_BACKWARD,
  ].includes(state);
}

export function isJumpAttackState(state: CharacterState): boolean {
  return [
    CharacterState.JUMP_LIGHT_PUNCH,
    CharacterState.JUMP_HEAVY_PUNCH,
    CharacterState.JUMP_LIGHT_KICK,
    CharacterState.JUMP_HEAVY_KICK,
  ].includes(state);
}

export function isAttackingState(state: CharacterState): boolean {
  return [
    CharacterState.STAND_LIGHT_PUNCH,
    CharacterState.STAND_HEAVY_PUNCH,
    CharacterState.STAND_LIGHT_KICK,
    CharacterState.STAND_HEAVY_KICK,
    CharacterState.CROUCH_LIGHT_PUNCH,
    CharacterState.CROUCH_HEAVY_PUNCH,
    CharacterState.CROUCH_LIGHT_KICK,
    CharacterState.CROUCH_HEAVY_KICK,
    CharacterState.JUMP_LIGHT_PUNCH,
    CharacterState.JUMP_HEAVY_PUNCH,
    CharacterState.JUMP_LIGHT_KICK,
    CharacterState.JUMP_HEAVY_KICK,
    CharacterState.SPECIAL_1,
  ].includes(state);
}

export function isBlockingState(state: CharacterState): boolean {
  return [
    CharacterState.STAND_GUARD,
    CharacterState.CROUCH_GUARD,
  ].includes(state);
}

/** Stand vs crouch guard uses pose and down input (down+back counts as crouch block). */
export function resolveDefenderBlockStance(defender: PlayerState): 'stand' | 'crouch' | null {
  if (!isBlockingState(defender.state)) return null;
  if (defender.state === CharacterState.CROUCH_GUARD || defender.input.down) {
    return 'crouch';
  }
  return 'stand';
}

/** Overheads: stand guard only. Lows: crouch guard only. Mids: stand guard only. */
export function canGuardBlockAttack(
  defender: PlayerState,
  attackOverhead: boolean,
  attackLow: boolean,
): boolean {
  const stance = resolveDefenderBlockStance(defender);
  if (!stance) return false;
  if (attackOverhead) return stance === 'stand';
  if (attackLow) return stance === 'crouch';
  return stance === 'stand';
}

export function isLightAttackState(state: CharacterState): boolean {
  return [
    CharacterState.STAND_LIGHT_PUNCH,
    CharacterState.STAND_LIGHT_KICK,
    CharacterState.CROUCH_LIGHT_PUNCH,
    CharacterState.CROUCH_LIGHT_KICK,
    CharacterState.JUMP_LIGHT_PUNCH,
    CharacterState.JUMP_LIGHT_KICK,
  ].includes(state);
}

export function isHeavyAttackState(state: CharacterState): boolean {
  return [
    CharacterState.STAND_HEAVY_PUNCH,
    CharacterState.STAND_HEAVY_KICK,
    CharacterState.CROUCH_HEAVY_PUNCH,
    CharacterState.CROUCH_HEAVY_KICK,
    CharacterState.JUMP_HEAVY_PUNCH,
    CharacterState.JUMP_HEAVY_KICK,
  ].includes(state);
}

export function isHitState(state: CharacterState): boolean {
  return [
    CharacterState.HIT_STUN,
    CharacterState.HIT_STUN_LIGHT,
    CharacterState.HIT_STUN_HEAVY,
    CharacterState.BLOCK_STUN,
    CharacterState.KNOCKDOWN,
    CharacterState.GET_UP,
  ].includes(state);
}

export function isKnockdownInvulnerableState(state: CharacterState): boolean {
  return state === CharacterState.KNOCKDOWN || state === CharacterState.GET_UP;
}

export function isDefenderInvulnerable(defender: PlayerState): boolean {
  return (defender.invincibleFrames ?? 0) > 0 || isKnockdownInvulnerableState(defender.state);
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

export function getOverlap(a: Box, b: Box): { x: number; y: number } {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  
  return {
    x: Math.max(0, overlapX),
    y: Math.max(0, overlapY),
  };
}

export function updateFacing(state: GameState): GameState {
  const [p1, p2] = state.players;
  
  if (!isAttackingState(p1.state) && !isHitState(p1.state)) {
    p1.facingRight = p1.position.x < p2.position.x;
  }
  
  if (!isAttackingState(p2.state) && !isHitState(p2.state)) {
    p2.facingRight = p2.position.x < p1.position.x;
  }
  
  return state;
}
