import { CharacterState } from '../engine/GameState';
import type { HurtboxData, HitboxData } from '../data/characters/BaseCharacter';

export interface BoxData {
  offset: { x: number; y: number };
  width: number;
  height: number;
}

export interface SavedHitboxFile {
  version: 1;
  hurtboxes: Partial<Record<CharacterState, BoxData>>;
  hitboxes: Partial<Record<CharacterState, BoxData>>;
  pushboxes?: Partial<Record<CharacterState, BoxData>>;
}

const hurtboxOverrides = new Map<CharacterState, BoxData>();
const hitboxOverrides = new Map<CharacterState, BoxData>();
const pushboxOverrides = new Map<CharacterState, BoxData>();

export function getHurtboxOverride(state: CharacterState): BoxData | undefined {
  return hurtboxOverrides.get(state);
}

export function getHitboxOverride(state: CharacterState): BoxData | undefined {
  return hitboxOverrides.get(state);
}

export function setHurtboxOverride(state: CharacterState, data: BoxData): void {
  hurtboxOverrides.set(state, { ...data, offset: { ...data.offset } });
}

export function setHitboxOverride(state: CharacterState, data: BoxData): void {
  hitboxOverrides.set(state, { ...data, offset: { ...data.offset } });
}

export function getPushboxOverride(state: CharacterState): BoxData | undefined {
  return pushboxOverrides.get(state);
}

export function setPushboxOverride(state: CharacterState, data: BoxData): void {
  pushboxOverrides.set(state, { ...data, offset: { ...data.offset } });
}

export function clearHitboxOverrides(): void {
  hurtboxOverrides.clear();
  hitboxOverrides.clear();
  pushboxOverrides.clear();
}

export function applySavedHitboxData(data: SavedHitboxFile): void {
  hurtboxOverrides.clear();
  hitboxOverrides.clear();

  for (const [state, box] of Object.entries(data.hurtboxes ?? {})) {
    if (!box) continue;
    hurtboxOverrides.set(state as CharacterState, {
      ...box,
      offset: { ...box.offset },
    });
  }

  for (const [state, box] of Object.entries(data.hitboxes ?? {})) {
    if (!box) continue;
    hitboxOverrides.set(state as CharacterState, {
      ...box,
      offset: { ...box.offset },
    });
  }

  for (const [state, box] of Object.entries(data.pushboxes ?? {})) {
    if (!box) continue;
    pushboxOverrides.set(state as CharacterState, {
      ...box,
      offset: { ...box.offset },
    });
  }
}

export function resolveHurtboxData(state: CharacterState, base: HurtboxData): HurtboxData {
  const override = hurtboxOverrides.get(state);
  if (!override) return base;
  return { ...override };
}

export function resolveHitboxData(state: CharacterState, base: HitboxData): HitboxData {
  const override = hitboxOverrides.get(state);
  if (!override) return base;
  return { ...override };
}

export function resolvePushboxData(state: CharacterState, base: BoxData): BoxData {
  const override = pushboxOverrides.get(state);
  if (!override) return base;
  return { ...override, offset: { ...override.offset } };
}
