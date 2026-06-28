import { CharacterState } from '../engine/GameState';
import { BASE_CHARACTER } from '../data/characters/BaseCharacter';
import type { HurtboxData, HitboxData } from '../data/characters/BaseCharacter';
import {
  type BoxData,
  getHitboxOverride,
  getHurtboxOverride,
  getPushboxOverride,
  setHitboxOverride,
  setHurtboxOverride,
  setPushboxOverride,
  clearHitboxOverrides,
  resolveHitboxData,
  resolveHurtboxData,
  resolvePushboxData,
  type SavedHitboxFile,
} from './hitboxOverrideStore';

export type { BoxData };
export {
  getHitboxOverride,
  getHurtboxOverride,
  getPushboxOverride,
  setHitboxOverride,
  setHurtboxOverride,
  setPushboxOverride,
  clearHitboxOverrides,
  resolveHitboxData,
  resolveHurtboxData,
  resolvePushboxData,
};

export function getBaseHurtboxData(state: CharacterState): HurtboxData | null {
  const stateData = BASE_CHARACTER.states[state];
  if (!stateData?.hurtbox) return null;
  return { ...stateData.hurtbox, offset: { ...stateData.hurtbox.offset } };
}

export function getBaseHitboxData(state: CharacterState): HitboxData | null {
  const stateData = BASE_CHARACTER.states[state];
  if (!stateData?.hitbox) return null;
  return { ...stateData.hitbox, offset: { ...stateData.hitbox.offset } };
}

export function getResolvedHurtboxData(state: CharacterState): HurtboxData | null {
  const base = getBaseHurtboxData(state);
  if (!base) return null;
  return resolveHurtboxData(state, base);
}

export function getResolvedHitboxData(state: CharacterState): HitboxData | null {
  const base = getBaseHitboxData(state);
  if (!base) return null;
  return resolveHitboxData(state, base);
}

export function getHurtboxEditStates(): CharacterState[] {
  return Object.entries(BASE_CHARACTER.states)
    .filter(([, data]) => data.hurtbox)
    .map(([state]) => state as CharacterState);
}

export function getHitboxEditStates(): CharacterState[] {
  return Object.entries(BASE_CHARACTER.states)
    .filter(([, data]) => data.hitbox)
    .map(([state]) => state as CharacterState);
}

const CROUCH_PUSHBOX_STATES = new Set<CharacterState>([
  CharacterState.CROUCH,
  CharacterState.CROUCH_GUARD,
  CharacterState.CROUCH_LIGHT_PUNCH,
  CharacterState.CROUCH_HEAVY_PUNCH,
  CharacterState.CROUCH_LIGHT_KICK,
  CharacterState.CROUCH_HEAVY_KICK,
]);

export function getBasePushboxData(state: CharacterState): BoxData {
  const width = BASE_CHARACTER.pushboxWidth;
  const height = CROUCH_PUSHBOX_STATES.has(state)
    ? BASE_CHARACTER.crouchPushboxHeight
    : BASE_CHARACTER.pushboxHeight;

  return {
    offset: { x: -Math.floor(width / 2), y: -height },
    width,
    height,
  };
}

export function getResolvedPushboxData(state: CharacterState): BoxData {
  return resolvePushboxData(state, getBasePushboxData(state));
}

export function getPushboxEditStates(): CharacterState[] {
  return getHurtboxEditStates();
}

export function boxDataToWorldBox(
  data: BoxData,
  position: { x: number; y: number },
  facingRight: boolean,
  isHitbox: boolean,
): { x: number; y: number; width: number; height: number } {
  const offsetX = isHitbox && !facingRight
    ? -data.offset.x - data.width
    : data.offset.x;

  return {
    x: position.x + offsetX,
    y: position.y + data.offset.y,
    width: data.width,
    height: data.height,
  };
}

export function worldBoxToBoxData(
  box: { x: number; y: number; width: number; height: number },
  position: { x: number; y: number },
  facingRight: boolean,
  isHitbox: boolean,
): BoxData {
  const offsetX = isHitbox && !facingRight
    ? -(box.x - position.x) - box.width
    : box.x - position.x;

  return {
    offset: { x: Math.round(offsetX), y: Math.round(box.y - position.y) },
    width: Math.max(100, Math.round(box.width)),
    height: Math.max(100, Math.round(box.height)),
  };
}

export function exportOverrideSnippet(
  state: CharacterState,
  kind: 'hurtbox' | 'hitbox' | 'pushbox',
): string {
  const data = kind === 'hurtbox'
    ? getResolvedHurtboxData(state)
    : kind === 'hitbox'
      ? getResolvedHitboxData(state)
      : getResolvedPushboxData(state);
  if (!data) return '';

  const key = kind === 'hurtbox' ? 'hurtbox' : kind === 'hitbox' ? 'hitbox' : 'pushbox';
  return `${key}: {
  offset: { x: ${data.offset.x}, y: ${data.offset.y} },
  width: ${data.width},
  height: ${data.height},
},`;
}

export function buildSavedHitboxFile(): SavedHitboxFile {
  const hurtboxes: Partial<Record<CharacterState, BoxData>> = {};
  const hitboxes: Partial<Record<CharacterState, BoxData>> = {};
  const pushboxes: Partial<Record<CharacterState, BoxData>> = {};

  for (const state of getHurtboxEditStates()) {
    const data = getResolvedHurtboxData(state);
    if (data) {
      hurtboxes[state] = {
        offset: { ...data.offset },
        width: data.width,
        height: data.height,
      };
    }
  }

  for (const state of getHitboxEditStates()) {
    const data = getResolvedHitboxData(state);
    if (data) {
      hitboxes[state] = {
        offset: { ...data.offset },
        width: data.width,
        height: data.height,
      };
    }
  }

  for (const state of getPushboxEditStates()) {
    const data = getResolvedPushboxData(state);
    pushboxes[state] = {
      offset: { ...data.offset },
      width: data.width,
      height: data.height,
    };
  }

  return { version: 1, hurtboxes, hitboxes, pushboxes };
}
