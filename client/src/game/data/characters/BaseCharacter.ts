/**
 * Base Character Data - Frame data and hitbox definitions
 */

import { CharacterState, Box } from '../../engine/GameState';
import {
  resolveHurtboxData,
  resolveHitboxData,
  resolvePushboxData,
} from '../../editor/hitboxOverrideStore';

export interface FrameData {
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  hitstun: number;
  blockstun: number;
  knockback: number;
  isLow: boolean;
  isOverhead: boolean;
  canCancel: boolean;
  /** Gatling targets on hit confirm (SF-style). Omit = any light chains. [] = none. */
  chainTargets?: CharacterState[];
}

export interface HitboxData {
  offset: { x: number; y: number };
  width: number;
  height: number;
}

export interface HurtboxData {
  offset: { x: number; y: number };
  width: number;
  height: number;
}

export interface StateData {
  duration: number;
  canMove: boolean;
  canAttack: boolean;
  canBlock: boolean;
  canJump: boolean;
  hitbox?: HitboxData;
  hurtbox: HurtboxData;
  frameData?: FrameData;
}

export interface CharacterData {
  name: string;
  walkSpeed: number;
  backwalkSpeed: number;
  jumpForce: number;
  jumpForceShort: number;
  jumpForwardSpeed: number;
  jumpBackwardSpeed: number;
  health: number;
  pushboxWidth: number;
  pushboxHeight: number;
  crouchPushboxHeight: number;
  states: Partial<Record<CharacterState, StateData>>;
}

import { GAME_CONFIG } from '../../engine/GameState';

// Hurtbox (blue): full body coverage - where attacks can hit
export const DEFAULT_HURTBOX: HurtboxData = {
  offset: { x: -GAME_CONFIG.HURTBOX_WIDTH / 2, y: -GAME_CONFIG.HURTBOX_HEIGHT },
  width: GAME_CONFIG.HURTBOX_WIDTH,
  height: GAME_CONFIG.HURTBOX_HEIGHT,
};

export const CROUCH_HURTBOX: HurtboxData = {
  offset: { x: -GAME_CONFIG.HURTBOX_WIDTH / 2, y: -Math.floor(GAME_CONFIG.HURTBOX_HEIGHT * 0.6) },
  width: GAME_CONFIG.HURTBOX_WIDTH,
  height: Math.floor(GAME_CONFIG.HURTBOX_HEIGHT * 0.6),
};

export const BASE_CHARACTER: CharacterData = {
  name: 'Fighter',
  walkSpeed: 400,
  backwalkSpeed: 320,
  jumpForce: Math.abs(GAME_CONFIG.JUMP_FORCE_FULL),
  jumpForceShort: Math.round(Math.abs(GAME_CONFIG.JUMP_FORCE_FULL) * Math.sqrt(GAME_CONFIG.JUMP_HOP_HEIGHT_RATIO)),
  jumpForwardSpeed: 500,
  jumpBackwardSpeed: 360,
  health: 1000,
  // Push box (green): narrower, for collision
  pushboxWidth: GAME_CONFIG.PUSH_BOX_WIDTH,
  pushboxHeight: GAME_CONFIG.PUSH_BOX_HEIGHT,
  crouchPushboxHeight: Math.floor(GAME_CONFIG.PUSH_BOX_HEIGHT * 0.6),
  
  states: {
    [CharacterState.IDLE]: {
      duration: -1,
      canMove: true,
      canAttack: true,
      canBlock: true,
      canJump: true,
      hurtbox: DEFAULT_HURTBOX,
    },
    
    [CharacterState.WALK_FORWARD]: {
      duration: -1,
      canMove: true,
      canAttack: true,
      canBlock: true,
      canJump: true,
      hurtbox: DEFAULT_HURTBOX,
    },
    
    [CharacterState.WALK_BACKWARD]: {
      duration: -1,
      canMove: true,
      canAttack: true,
      canBlock: true,
      canJump: true,
      hurtbox: DEFAULT_HURTBOX,
    },
    
    [CharacterState.CROUCH]: {
      duration: -1,
      canMove: false,
      canAttack: true,
      canBlock: true,
      canJump: false,
      hurtbox: CROUCH_HURTBOX,
    },
    
    [CharacterState.JUMP_START]: {
      duration: 4,
      canMove: false,
      canAttack: false,
      canBlock: false,
      canJump: false,
      hurtbox: DEFAULT_HURTBOX,
    },
    
    [CharacterState.JUMP_UP]: {
      duration: -1,
      canMove: false,
      canAttack: true,
      canBlock: false,
      canJump: false,
      hurtbox: DEFAULT_HURTBOX,
    },
    
    [CharacterState.JUMP_FORWARD]: {
      duration: -1,
      canMove: false,
      canAttack: true,
      canBlock: false,
      canJump: false,
      hurtbox: DEFAULT_HURTBOX,
    },
    
    [CharacterState.JUMP_BACKWARD]: {
      duration: -1,
      canMove: false,
      canAttack: true,
      canBlock: false,
      canJump: false,
      hurtbox: DEFAULT_HURTBOX,
    },

    [CharacterState.DASH_BACKWARD]: {
      duration: -1,
      canMove: false,
      canAttack: true,
      canBlock: false,
      canJump: false,
      hurtbox: DEFAULT_HURTBOX,
    },
    
    [CharacterState.JUMP_FALL]: {
      duration: -1,
      canMove: false,
      canAttack: true,
      canBlock: false,
      canJump: false,
      hurtbox: DEFAULT_HURTBOX,
    },

    [CharacterState.JUMP_LIGHT_PUNCH]: {
      duration: 13,
      canMove: false,
      canAttack: false,
      canBlock: false,
      canJump: false,
      hurtbox: DEFAULT_HURTBOX,
      hitbox: {
        offset: { x: 3000, y: -16000 },
        width: 5000,
        height: 3000,
      },
      frameData: {
        startup: 4,
        active: 3,
        recovery: 6,
        damage: 20,
        hitstun: 15,
        blockstun: 8,
        knockback: 200,
        isLow: false,
        isOverhead: true,
        canCancel: false,
      },
    },

    [CharacterState.JUMP_HEAVY_PUNCH]: {
      duration: 21,
      canMove: false,
      canAttack: false,
      canBlock: false,
      canJump: false,
      hurtbox: DEFAULT_HURTBOX,
      hitbox: {
        offset: { x: 3000, y: -17000 },
        width: 6000,
        height: 3500,
      },
      frameData: {
        startup: 7,
        active: 4,
        recovery: 10,
        damage: 50,
        hitstun: 17,
        blockstun: 11,
        knockback: 350,
        isLow: false,
        isOverhead: true,
        canCancel: false,
      },
    },

    [CharacterState.JUMP_LIGHT_KICK]: {
      duration: 17,
      canMove: false,
      canAttack: false,
      canBlock: false,
      canJump: false,
      hurtbox: DEFAULT_HURTBOX,
      hitbox: {
        offset: { x: 3000, y: -10000 },
        width: 6500,
        height: 3500,
      },
      frameData: {
        startup: 5,
        active: 4,
        recovery: 8,
        damage: 25,
        hitstun: 14,
        blockstun: 9,
        knockback: 250,
        isLow: false,
        isOverhead: true,
        canCancel: false,
      },
    },

    [CharacterState.JUMP_HEAVY_KICK]: {
      duration: 23,
      canMove: false,
      canAttack: false,
      canBlock: false,
      canJump: false,
      hurtbox: DEFAULT_HURTBOX,
      hitbox: {
        offset: { x: 3000, y: -9000 },
        width: 7000,
        height: 4000,
      },
      frameData: {
        startup: 6,
        active: 5,
        recovery: 12,
        damage: 55,
        hitstun: 18,
        blockstun: 12,
        knockback: 400,
        isLow: false,
        isOverhead: true,
        canCancel: false,
      },
    },
    
    [CharacterState.LANDING]: {
      duration: 4,
      canMove: false,
      canAttack: false,
      canBlock: true,
      canJump: false,
      hurtbox: DEFAULT_HURTBOX,
    },
    
    [CharacterState.STAND_GUARD]: {
      duration: -1,
      canMove: false,
      canAttack: false,
      canBlock: true,
      canJump: false,
      hurtbox: DEFAULT_HURTBOX,
    },
    
    [CharacterState.CROUCH_GUARD]: {
      duration: -1,
      canMove: false,
      canAttack: false,
      canBlock: true,
      canJump: false,
      hurtbox: CROUCH_HURTBOX,
    },
    
    [CharacterState.STAND_LIGHT_PUNCH]: {
      duration: 12,
      canMove: false,
      canAttack: false,
      canBlock: false,
      canJump: false,
      hurtbox: DEFAULT_HURTBOX,
      hitbox: {
        offset: { x: 3000, y: -30000 },
        width: 13000,
        height: 3000,
      },
      frameData: {
        startup: 4,
        active: 2,
        recovery: 6,
        damage: 30,
        hitstun: 14,
        blockstun: 9,
        knockback: 200,
        isLow: false,
        isOverhead: false,
        canCancel: true,
      },
    },
    
    [CharacterState.STAND_HEAVY_PUNCH]: {
      duration: 25,
      canMove: false,
      canAttack: false,
      canBlock: false,
      canJump: false,
      hurtbox: DEFAULT_HURTBOX,
      hitbox: {
        offset: { x: 3000, y: -10000 },
        width: 7000,
        height: 4000,
      },
      frameData: {
        startup: 7,
        active: 4,
        recovery: 14,
        damage: 70,
        hitstun: 18,
        blockstun: 12,
        knockback: 400,
        isLow: false,
        isOverhead: false,
        canCancel: true,
      },
    },
    
    [CharacterState.STAND_LIGHT_KICK]: {
      duration: 16,
      canMove: false,
      canAttack: false,
      canBlock: false,
      canJump: false,
      hurtbox: DEFAULT_HURTBOX,
      hitbox: {
        offset: { x: 3000, y: -4000 },
        width: 14000,
        height: 4000,
      },
      frameData: {
        startup: 5,
        active: 3,
        recovery: 8,
        damage: 50,
        hitstun: 16,
        blockstun: 11,
        knockback: 250,
        isLow: true,
        isOverhead: false,
        canCancel: true,
      },
    },
    
    [CharacterState.STAND_HEAVY_KICK]: {
      duration: 35,
      canMove: false,
      canAttack: false,
      canBlock: false,
      canJump: false,
      hurtbox: DEFAULT_HURTBOX,
      hitbox: {
        offset: { x: 3000, y: -7000 },
        width: 8000,
        height: 5000,
      },
      frameData: {
        startup: 10,
        active: 5,
        recovery: 20,
        damage: 80,
        hitstun: 20,
        blockstun: 14,
        knockback: 500,
        isLow: false,
        isOverhead: false,
        canCancel: true,
      },
    },
    
    [CharacterState.CROUCH_LIGHT_PUNCH]: {
      duration: 13,
      canMove: false,
      canAttack: false,
      canBlock: false,
      canJump: false,
      hurtbox: CROUCH_HURTBOX,
      hitbox: {
        offset: { x: 3000, y: -19000 },
        width: 13000,
        height: 3000,
      },
      frameData: {
        startup: 5,
        active: 2,
        recovery: 6,
        damage: 20,
        hitstun: 14,
        blockstun: 5,
        knockback: 150,
        isLow: false,
        isOverhead: false,
        canCancel: true,
      },
    },
    
    [CharacterState.CROUCH_HEAVY_PUNCH]: {
      duration: 26,
      canMove: false,
      canAttack: false,
      canBlock: false,
      canJump: false,
      hurtbox: CROUCH_HURTBOX,
      hitbox: {
        offset: { x: 3000, y: -6000 },
        width: 6000,
        height: 5000,
      },
      frameData: {
        startup: 4,
        active: 4,
        recovery: 18,
        damage: 65,
        hitstun: 17,
        blockstun: 11,
        knockback: 350,
        isLow: false,
        isOverhead: false,
        canCancel: true,
      },
    },
    
    [CharacterState.CROUCH_LIGHT_KICK]: {
      duration: 13,
      canMove: false,
      canAttack: false,
      canBlock: false,
      canJump: false,
      hurtbox: CROUCH_HURTBOX,
      hitbox: {
        offset: { x: 3000, y: -4000 },
        width: 18000,
        height: 4000,
      },
      frameData: {
        startup: 5,
        active: 2,
        recovery: 6,
        damage: 20,
        hitstun: 14,
        blockstun: 4,
        knockback: 200,
        isLow: true,
        isOverhead: false,
        canCancel: true,
      },
    },
    
    [CharacterState.CROUCH_HEAVY_KICK]: {
      duration: 37,
      canMove: false,
      canAttack: false,
      canBlock: false,
      canJump: false,
      hurtbox: CROUCH_HURTBOX,
      hitbox: {
        offset: { x: 3000, y: -1500 },
        width: 9000,
        height: 3000,
      },
      frameData: {
        startup: 9,
        active: 6,
        recovery: 22,
        damage: 90,
        hitstun: 30,
        blockstun: 16,
        knockback: 0,
        isLow: true,
        isOverhead: false,
        canCancel: true,
      },
    },
    
    [CharacterState.SPECIAL_1]: {
      duration: 40,
      canMove: false,
      canAttack: false,
      canBlock: false,
      canJump: false,
      hurtbox: DEFAULT_HURTBOX,
      hitbox: {
        offset: { x: 10500, y: -6000 },
        width: 6500,
        height: 3200,
      },
      frameData: {
        startup: 8,
        active: 15,
        recovery: 17,
        damage: 70,
        hitstun: 14,
        blockstun: 12,
        knockback: 400,
        isLow: false,
        isOverhead: false,
        canCancel: false,
      },
    },
    
    [CharacterState.HIT_STUN]: {
      duration: -1,
      canMove: false,
      canAttack: false,
      canBlock: false,
      canJump: false,
      hurtbox: DEFAULT_HURTBOX,
    },

    [CharacterState.HIT_STUN_LIGHT]: {
      duration: -1,
      canMove: false,
      canAttack: false,
      canBlock: false,
      canJump: false,
      hurtbox: DEFAULT_HURTBOX,
    },

    [CharacterState.HIT_STUN_HEAVY]: {
      duration: -1,
      canMove: false,
      canAttack: false,
      canBlock: false,
      canJump: false,
      hurtbox: DEFAULT_HURTBOX,
    },
    
    [CharacterState.BLOCK_STUN]: {
      duration: -1,
      canMove: false,
      canAttack: false,
      canBlock: true,
      canJump: false,
      hurtbox: DEFAULT_HURTBOX,
    },
    
    [CharacterState.KNOCKDOWN]: {
      duration: 50,
      canMove: false,
      canAttack: false,
      canBlock: false,
      canJump: false,
      hurtbox: {
        offset: { x: -4000, y: -2000 },
        width: 8000,
        height: 2000,
      },
    },
    
    [CharacterState.GET_UP]: {
      duration: 25,
      canMove: false,
      canAttack: false,
      canBlock: false,
      canJump: false,
      hurtbox: DEFAULT_HURTBOX,
    },
  },
};

export function getStateData(character: CharacterData, state: CharacterState): StateData | undefined {
  return character.states[state];
}

export function getHitbox(character: CharacterData, state: CharacterState, frame: number, facingRight: boolean, position: { x: number; y: number }): Box | null {
  const stateData = character.states[state];
  if (!stateData?.hitbox || !stateData.frameData) return null;
  
  const { startup, active } = stateData.frameData;
  if (frame < startup || frame >= startup + active) return null;
  
  const hitbox = resolveHitboxData(state, stateData.hitbox);
  const offsetX = facingRight ? hitbox.offset.x : -hitbox.offset.x - hitbox.width;
  
  return {
    x: position.x + offsetX,
    y: position.y + hitbox.offset.y,
    width: hitbox.width,
    height: hitbox.height,
  };
}

export function getHurtbox(character: CharacterData, state: CharacterState, position: { x: number; y: number }): Box {
  const stateData = character.states[state];
  const hurtbox = resolveHurtboxData(state, stateData?.hurtbox || DEFAULT_HURTBOX);
  
  return {
    x: position.x + hurtbox.offset.x,
    y: position.y + hurtbox.offset.y,
    width: hurtbox.width,
    height: hurtbox.height,
  };
}

const CROUCH_PUSHBOX_STATES = new Set<CharacterState>([
  CharacterState.CROUCH,
  CharacterState.CROUCH_GUARD,
  CharacterState.CROUCH_LIGHT_PUNCH,
  CharacterState.CROUCH_HEAVY_PUNCH,
  CharacterState.CROUCH_LIGHT_KICK,
  CharacterState.CROUCH_HEAVY_KICK,
]);

export function getPushbox(
  character: CharacterData,
  state: CharacterState,
  position: { x: number; y: number },
): Box {
  const width = character.pushboxWidth;
  const height = CROUCH_PUSHBOX_STATES.has(state)
    ? character.crouchPushboxHeight
    : character.pushboxHeight;
  const base = {
    offset: { x: -Math.floor(width / 2), y: -height },
    width,
    height,
  };
  const pushbox = resolvePushboxData(state, base);

  return {
    x: position.x + pushbox.offset.x,
    y: position.y + pushbox.offset.y,
    width: pushbox.width,
    height: pushbox.height,
  };
}
