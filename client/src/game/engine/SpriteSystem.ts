/**
 * Sprite System - Loads and manages sprite animations
 */

import { CharacterState, PlayerState, GAME_CONFIG } from './GameState';

export interface SpriteFrame {
  image: HTMLImageElement;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

export interface Animation {
  frames: SpriteFrame[];
  frameDuration: number;
  loop: boolean;
  /** Map attack stateFrame to sprite by startup / active / recovery game frames */
  phaseAttack?: { startup: number; active: number; recovery?: number };
  /** Sprite shown only during the active phase (startup/recovery use frames[]) */
  activeFrame?: SpriteFrame;
  /** Sprite shown only during the startup phase */
  startupFrame?: SpriteFrame;
  /** Sprite shown for the entire recovery phase */
  recoveryFrame?: SpriteFrame;
  /** Sprites played sequentially during recovery (e.g. 13→9) */
  recoveryFrames?: SpriteFrame[];
  /** Sprites played sequentially during startup (e.g. kick_combo 10→11) */
  startupFrames?: SpriteFrame[];
  /** Play frames sequentially across KNOCKDOWN → GET_UP using stateFrame */
  knockdownSequence?: boolean;
  /** Select frame from velocity during jump arc (12→16 at apex) */
  jumpArc?: boolean;
}

export interface SpriteData {
  animations: Partial<Record<CharacterState, Animation>>;
  defaultAnimation: CharacterState;
}

const ANIMATION_CONFIG: Record<string, { 
  folder: string; 
  frameCount: number; 
  frameDuration: number;
  loop: boolean;
  states: CharacterState[];
  startFrame?: number;
  /** Custom frame order (e.g. [22, 21, 22]) */
  frameIndices?: number[];
  phaseAttack?: { startup: number; active: number; recovery?: number };
  /** Custom filename for active-phase sprite in the same folder */
  activeFrameFile?: string;
  /** Custom filename for startup-phase sprite (optional separate folder) */
  startupFrameFile?: string;
  startupFrameFolder?: string;
  /** Frame numbers for sequential startup animation */
  startupFrameIndices?: number[];
  /** Custom filename for recovery-phase sprite (optional separate folder) */
  recoveryFrameFile?: string;
  recoveryFrameFolder?: string;
  /** Frame numbers for sequential recovery animation */
  recoveryFrameIndices?: number[];
  knockdownSequence?: boolean;
  jumpArc?: boolean;
}> = {
  idle: {
    folder: 'idle',
    frameCount: 9,
    frameDuration: 8,
    loop: true,
    states: [
      CharacterState.IDLE,
    ],
  },
  walk_forward: {
    folder: 'walk',
    frameCount: 11,
    frameDuration: 6,
    loop: true,
    frameIndices: [14, 15, 16, 17, 18, 19, 20, 21, 22,23,24],
    states: [
      CharacterState.WALK_FORWARD,
    ],
  },
  walk_backward: {
    folder: 'walk',
    frameCount: 11,
    frameDuration: 6,
    loop: true,
    frameIndices: [24,23, 22, 21, 20, 19, 18, 17, 16, 15, 14],
    states: [
      CharacterState.WALK_BACKWARD,
    ],
  },
  dash_forward: {
    folder: 'dash',
    frameCount: 9,
    frameDuration: 6,
    loop: true,
    frameIndices: [18, 19, 20, 21, 22, 23, 24, 25, 26],
    states: [
      CharacterState.DASH_FORWARD,
    ],
  },
  crouch: {
    folder: 'crouch',
    frameCount: 1,
    frameDuration: 1,
    loop: false,
    startFrame: 28,
    states: [
      CharacterState.CROUCH,
    ],
  },
  crouch_heavy_kick: {
    folder: 'crouch_kick_combo',
    frameCount: 7,
    frameDuration: 1,
    loop: false,
    frameIndices: [10, 11, 12, 13, 14, 15, 16],
    phaseAttack: { startup: 9, active: 6, recovery: 22 },
    states: [
      CharacterState.CROUCH_HEAVY_KICK,
    ],
  },
  crouch_heavy_punch: {
    folder: 'crouch_upper',
    frameCount: 3,
    frameDuration: 1,
    loop: false,
    frameIndices: [20, 21, 22],
    activeFrameFile: 'crouch_upper_active.png',
    startupFrameFile: 'crouch_attack_19.png',
    startupFrameFolder: 'crouch_attack',
    phaseAttack: { startup: 4, active: 4, recovery: 18 },
    states: [
      CharacterState.CROUCH_HEAVY_PUNCH,
    ],
  },
  crouch_light_punch: {
    folder: 'crouch_attack',
    frameCount: 2,
    frameDuration: 1,
    loop: false,
    frameIndices: [19, 14],
    phaseAttack: { startup: 5, active: 2, recovery: 8 },
    states: [
      CharacterState.CROUCH_LIGHT_PUNCH,
    ],
  },
  crouch_light_kick: {
    folder: 'crouch_attack',
    frameCount: 2,
    frameDuration: 1,
    loop: false,
    frameIndices: [44, 38],
    phaseAttack: { startup: 5, active: 2, recovery: 9 },
    states: [
      CharacterState.CROUCH_LIGHT_KICK,
    ],
  },
  crouch_guard: {
    folder: 'crouch_attack',
    frameCount: 1,
    frameDuration: 1,
    loop: false,
    startFrame: 19,
    states: [
      CharacterState.CROUCH_GUARD,
    ],
  },
  jump_arc: {
    folder: 'jump_punch_light',
    frameCount: 5,
    frameDuration: 1,
    loop: false,
    frameIndices: [12, 13, 14, 15, 16],
    jumpArc: true,
    states: [
      CharacterState.JUMP_START,
      CharacterState.JUMP_UP,
      CharacterState.JUMP_FORWARD,
      CharacterState.JUMP_BACKWARD,
      CharacterState.JUMP_FALL,
      CharacterState.LANDING,
    ],
  },
  jump_punch_heavy: {
    folder: 'jump_punch_heavy',
    frameCount: 1,
    frameDuration: 1,
    loop: false,
    startFrame: 0,
    states: [
      CharacterState.JUMP_HEAVY_PUNCH,
    ],
  },
  jump_kick_light: {
    folder: 'jump_kick_light',
    frameCount: 1,
    frameDuration: 1,
    loop: false,
    startFrame: 0,
    states: [
      CharacterState.JUMP_LIGHT_KICK,
    ],
  },
  jump_kick_heavy: {
    folder: 'jump_kick_heavy',
    frameCount: 1,
    frameDuration: 1,
    loop: false,
    startFrame: 2,
    states: [
      CharacterState.JUMP_HEAVY_KICK,
    ],
  },
  backdash: {
    folder: 'jump',
    frameCount: 1,
    frameDuration: 1,
    loop: false,
    startFrame: 6,
    states: [
      CharacterState.DASH_BACKWARD,
    ],
  },
  punch_guard: {
    folder: 'punch_combo',
    frameCount: 1,
    frameDuration: 1,
    loop: false,
    startFrame: 24,
    states: [
      CharacterState.STAND_GUARD,
      CharacterState.BLOCK_STUN,
    ],
  },
  punch_light: {
    folder: 'punch_combo',
    frameCount: 2,
    frameDuration: 1,
    loop: false,
    frameIndices: [22, 21],
    phaseAttack: { startup: 4, active: 2 },
    states: [
      CharacterState.STAND_LIGHT_PUNCH,
    ],
  },
  punch_heavy: {
    folder: 'punch_combo',
    frameCount: 5,
    frameDuration: 1,
    loop: false,
    frameIndices: [29, 30, 31, 32, 33],
    phaseAttack: { startup: 7, active: 4, recovery: 14 },
    states: [
      CharacterState.STAND_HEAVY_PUNCH,
    ],
  },
  kick_heavy: {
    folder: 'kick_combo',
    frameCount: 7,
    frameDuration: 1,
    loop: false,
    frameIndices: [38, 39, 40, 41, 42, 43, 44],
    phaseAttack: { startup: 10, active: 5, recovery: 20 },
    recoveryFrameIndices: [13, 12, 11, 10, 9],
    states: [
      CharacterState.STAND_HEAVY_KICK,
    ],
  },
  stand_light_kick: {
    folder: 'lowkick',
    frameCount: 1,
    frameDuration: 1,
    loop: false,
    startFrame: 0,
    phaseAttack: { startup: 5, active: 3, recovery: 8 },
    startupFrameIndices: [0],
    startupFrameFolder: 'idle',
    states: [
      CharacterState.STAND_LIGHT_KICK,
    ],
  },
  dropkick: {
    folder: 'dropkick',
    frameCount: 2,
    frameDuration: 1,
    loop: false,
    frameIndices: [2, 3],
    phaseAttack: { startup: 8, active: 15, recovery: 17 },
    recoveryFrameFile: 'crouch_28.png',
    recoveryFrameFolder: 'crouch',
    states: [
      CharacterState.SPECIAL_1,
    ],
  },
  hurt_light: {
    folder: 'hurt_light',
    frameCount: 1,
    frameDuration: 1,
    loop: false,
    startFrame: 7,
    states: [
      CharacterState.HIT_STUN_LIGHT,
    ],
  },
  hurt_heavy: {
    folder: 'hurt_heavy',
    frameCount: 5,
    frameDuration: 1,
    loop: false,
    frameIndices: [4, 5, 6, 7, 8],
    states: [
      CharacterState.HIT_STUN_HEAVY,
    ],
  },
  jump_punch_light: {
    folder: 'jump_punch_light',
    frameCount: 1,
    frameDuration: 1,
    loop: false,
    startFrame: 27,
    states: [
      CharacterState.JUMP_LIGHT_PUNCH,
    ],
  },
  knockdown: {
    folder: 'knockdown',
    frameCount: 49,
    frameDuration: 1,
    loop: false,
    knockdownSequence: true,
    states: [
      CharacterState.KNOCKDOWN,
      CharacterState.GET_UP,
    ],
  },
};

export class SpriteLoader {
  private cache: Map<string, HTMLImageElement> = new Map();
  private loading: Map<string, Promise<HTMLImageElement>> = new Map();
  private spriteData: SpriteData | null = null;
  private loaded: boolean = false;

  async loadAll(): Promise<SpriteData> {
    if (this.spriteData && this.loaded) {
      return this.spriteData;
    }

    const animations: Partial<Record<CharacterState, Animation>> = {};

    for (const [_name, config] of Object.entries(ANIMATION_CONFIG)) {
      const frames: SpriteFrame[] = [];
      const startFrame = config.startFrame ?? 0;
      const frameIndices = config.frameIndices
        ?? Array.from({ length: config.frameCount }, (_, i) => startFrame + i);
      
      for (const frameIdx of frameIndices) {
        const path = `/sprites/${config.folder}/${config.folder}_${frameIdx.toString().padStart(2, '0')}.png`;
        const img = await this.loadImage(path);
        
        frames.push({
          image: img,
          width: img.width,
          height: img.height,
          offsetX: 0,
          offsetY: 0,
        });
      }

      let activeFrame: SpriteFrame | undefined;
      if (config.activeFrameFile) {
        const activePath = `/sprites/${config.folder}/${config.activeFrameFile}`;
        const activeImg = await this.loadImage(activePath);
        activeFrame = {
          image: activeImg,
          width: activeImg.width,
          height: activeImg.height,
          offsetX: 0,
          offsetY: 0,
        };
      }

      let startupFrame: SpriteFrame | undefined;
      if (config.startupFrameFile) {
        const startupFolder = config.startupFrameFolder ?? config.folder;
        const startupPath = `/sprites/${startupFolder}/${config.startupFrameFile}`;
        const startupImg = await this.loadImage(startupPath);
        startupFrame = {
          image: startupImg,
          width: startupImg.width,
          height: startupImg.height,
          offsetX: 0,
          offsetY: 0,
        };
      }

      let recoveryFrame: SpriteFrame | undefined;
      if (config.recoveryFrameFile) {
        const recoveryFolder = config.recoveryFrameFolder ?? config.folder;
        const recoveryPath = `/sprites/${recoveryFolder}/${config.recoveryFrameFile}`;
        const recoveryImg = await this.loadImage(recoveryPath);
        recoveryFrame = {
          image: recoveryImg,
          width: recoveryImg.width,
          height: recoveryImg.height,
          offsetX: 0,
          offsetY: 0,
        };
      }

      let recoveryFrames: SpriteFrame[] | undefined;
      if (config.recoveryFrameIndices) {
        const recoveryFolder = config.recoveryFrameFolder ?? config.folder;
        recoveryFrames = [];
        for (const frameIdx of config.recoveryFrameIndices) {
          const path = `/sprites/${recoveryFolder}/${recoveryFolder}_${frameIdx.toString().padStart(2, '0')}.png`;
          const img = await this.loadImage(path);
          recoveryFrames.push({
            image: img,
            width: img.width,
            height: img.height,
            offsetX: 0,
            offsetY: 0,
          });
        }
      }

      let startupFrames: SpriteFrame[] | undefined;
      if (config.startupFrameIndices) {
        const startupFolder = config.startupFrameFolder ?? config.folder;
        startupFrames = [];
        for (const frameIdx of config.startupFrameIndices) {
          const path = `/sprites/${startupFolder}/${startupFolder}_${frameIdx.toString().padStart(2, '0')}.png`;
          const img = await this.loadImage(path);
          startupFrames.push({
            image: img,
            width: img.width,
            height: img.height,
            offsetX: 0,
            offsetY: 0,
          });
        }
      }

      const animation: Animation = {
        frames,
        frameDuration: config.frameDuration,
        loop: config.loop,
        phaseAttack: config.phaseAttack,
        activeFrame,
        startupFrame,
        recoveryFrame,
        recoveryFrames,
        startupFrames,
        knockdownSequence: config.knockdownSequence,
        jumpArc: config.jumpArc,
      };

      for (const state of config.states) {
        animations[state] = animation;
      }
    }

    this.spriteData = {
      animations,
      defaultAnimation: CharacterState.IDLE,
    };
    
    this.loaded = true;
    return this.spriteData;
  }

  private loadImage(path: string): Promise<HTMLImageElement> {
    if (this.cache.has(path)) {
      return Promise.resolve(this.cache.get(path)!);
    }

    if (this.loading.has(path)) {
      return this.loading.get(path)!;
    }

    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.cache.set(path, img);
        this.loading.delete(path);
        resolve(img);
      };
      img.onerror = () => {
        this.loading.delete(path);
        reject(new Error(`Failed to load image: ${path}`));
      };
      img.src = path;
    });

    this.loading.set(path, promise);
    return promise;
  }

  getSpriteData(): SpriteData | null {
    return this.spriteData;
  }

  isLoaded(): boolean {
    return this.loaded;
  }
}

export function getJumpArcFrameIndex(player: PlayerState): number {
  const frameCount = 5;
  const lastIndex = frameCount - 1;
  /** Rise uses jump_punch_light_12 → _13 only (indices 0–1) */
  const riseMaxIndex = 1;

  if (player.state === CharacterState.JUMP_START) {
    return 0;
  }

  if (player.state === CharacterState.LANDING) {
    const landingFrames = 3;
    const progress = Math.min(1, player.stateFrame / landingFrames);
    return Math.round(progress * lastIndex);
  }

  if (player.state === CharacterState.JUMP_FALL) {
    const vy = player.velocity.y;
    const fallSpeed = GAME_CONFIG.GRAVITY_FALL * 10;
    const fallProgress = Math.min(1, Math.max(0, vy) / fallSpeed);
    return Math.round((1 - fallProgress) * lastIndex);
  }

  const vy = player.velocity.y;
  const takeoffSpeed = Math.abs(GAME_CONFIG.JUMP_FORCE_FULL);

  if (vy < 0) {
    const riseProgress = 1 - Math.min(1, Math.abs(vy) / takeoffSpeed);
    return Math.round(riseProgress * riseMaxIndex);
  }

  return riseMaxIndex;
}

function getSequentialPhaseSpriteIndex(
  phaseFrame: number,
  phaseLength: number,
  spriteCount: number,
  reverse: boolean,
): number {
  if (phaseLength <= 0) {
    return reverse ? 0 : spriteCount - 1;
  }

  if (phaseLength >= spriteCount) {
    if (phaseFrame < spriteCount) {
      return reverse ? spriteCount - 1 - phaseFrame : phaseFrame;
    }
    return reverse ? 0 : spriteCount - 1;
  }

  const clamped = Math.min(Math.max(phaseFrame, 0), phaseLength - 1);
  const index = Math.floor((clamped * spriteCount) / phaseLength);
  const safeIndex = Math.min(spriteCount - 1, Math.max(0, index));
  return reverse ? spriteCount - 1 - safeIndex : safeIndex;
}

/** Spread sprites evenly across the full phase (e.g. 20f recovery ÷ 5 sprites = 4f each) */
function getUniformPhaseSpriteIndex(
  phaseFrame: number,
  phaseLength: number,
  spriteCount: number,
): number {
  if (phaseLength <= 0 || spriteCount <= 0) {
    return 0;
  }
  const clamped = Math.min(Math.max(phaseFrame, 0), phaseLength - 1);
  const index = Math.floor((clamped * spriteCount) / phaseLength);
  return Math.min(spriteCount - 1, Math.max(0, index));
}

const KNOCKDOWN_STATE_FRAMES = 30;
const GET_UP_STATE_FRAMES = 20;

function getKnockdownSequenceFrameIndex(
  player: PlayerState,
  spriteCount: number,
): number {
  let sequenceFrame: number;

  if (player.state === CharacterState.KNOCKDOWN) {
    sequenceFrame = player.stateFrame;
  } else if (player.state === CharacterState.GET_UP) {
    sequenceFrame = KNOCKDOWN_STATE_FRAMES + player.stateFrame;
  } else {
    return 0;
  }

  const totalDuration = KNOCKDOWN_STATE_FRAMES + GET_UP_STATE_FRAMES;
  const index = Math.floor((sequenceFrame * spriteCount) / totalDuration);
  return Math.min(spriteCount - 1, Math.max(0, index));
}

function resolvePhaseStartupFrame(
  animation: Animation,
  stateFrame: number,
  startup: number,
): SpriteFrame | null {
  if (animation.startupFrames && animation.startupFrames.length > 0) {
    const idx = getUniformPhaseSpriteIndex(stateFrame, startup, animation.startupFrames.length);
    return animation.startupFrames[idx];
  }
  if (animation.startupFrame) {
    return animation.startupFrame;
  }
  return null;
}

export function getAnimationFrame(
  spriteData: SpriteData,
  state: CharacterState,
  frameCount: number,
  player?: PlayerState,
): SpriteFrame | null {
  const animation = spriteData.animations[state] 
    || spriteData.animations[spriteData.defaultAnimation];
  
  if (!animation || animation.frames.length === 0) {
    return null;
  }

  const totalFrames = animation.frames.length;

  if (animation.jumpArc && player) {
    const frameIndex = Math.min(getJumpArcFrameIndex(player), totalFrames - 1);
    return animation.frames[frameIndex];
  }

  if (animation.knockdownSequence && player) {
    const frameIndex = getKnockdownSequenceFrameIndex(player, totalFrames);
    return animation.frames[frameIndex];
  }

  if (animation.phaseAttack) {
    const { startup, active, recovery = 0 } = animation.phaseAttack;
    const stateFrame = frameCount;
    const spriteCount = animation.frames.length;

    if (spriteCount === 2) {
      if (stateFrame < startup) {
        const startupSprite = resolvePhaseStartupFrame(animation, stateFrame, startup);
        if (startupSprite) return startupSprite;
        return animation.frames[0];
      }
      if (stateFrame < startup + active) {
        return animation.frames[1];
      }
      if (recovery > 0 && animation.recoveryFrame) {
        return animation.recoveryFrame;
      }
      return animation.frames[1];
    }

    if (spriteCount === 5 && recovery > 0) {
      if (stateFrame < startup) {
        const startupSprite = resolvePhaseStartupFrame(animation, stateFrame, startup);
        if (startupSprite) return startupSprite;
        const mid = Math.ceil(startup / 2);
        return animation.frames[stateFrame < mid ? 0 : 1];
      }
      if (stateFrame < startup + active) {
        return animation.frames[2];
      }
      const recoveryFrame = stateFrame - startup - active;
      const mid = Math.ceil(recovery / 2);
      return animation.frames[recoveryFrame < mid ? 3 : 4];
    }

    if (spriteCount >= 3) {
      if (stateFrame < startup) {
        const startupSprite = resolvePhaseStartupFrame(animation, stateFrame, startup);
        if (startupSprite) return startupSprite;
        const idx = getSequentialPhaseSpriteIndex(stateFrame, startup, spriteCount, false);
        return animation.frames[idx];
      }

      if (stateFrame < startup + active) {
        if (animation.activeFrame) {
          return animation.activeFrame;
        }
        return animation.frames[spriteCount - 1];
      }

      if (recovery > 0) {
        if (animation.recoveryFrames && animation.recoveryFrames.length > 0) {
          const recoveryFrame = stateFrame - startup - active;
          const idx = getUniformPhaseSpriteIndex(
            recoveryFrame,
            recovery,
            animation.recoveryFrames.length,
          );
          return animation.recoveryFrames[idx];
        }
        if (animation.recoveryFrame) {
          return animation.recoveryFrame;
        }
        const recoveryFrame = stateFrame - startup - active;
        const idx = getSequentialPhaseSpriteIndex(recoveryFrame, recovery, spriteCount, true);
        return animation.frames[idx];
      }

      return animation.frames[0];
    }

    if (stateFrame < startup) {
      const startupSprite = resolvePhaseStartupFrame(animation, stateFrame, startup);
      if (startupSprite) return startupSprite;
      return animation.frames[0];
    }
    const frameIndex = Math.min(1, spriteCount - 1);
    return animation.frames[frameIndex];
  }

  if (state === CharacterState.IDLE && player) {
    if (!player.idleFidgetActive) {
      return animation.frames[0];
    }
    return animation.frames[Math.min(player.idleFidgetIndex, totalFrames - 1)];
  }

  const animFrame = Math.floor(frameCount / animation.frameDuration);
  
  const frameIndex = animation.loop 
    ? animFrame % totalFrames
    : Math.min(animFrame, totalFrames - 1);

  return animation.frames[frameIndex];
}

export const globalSpriteLoader = new SpriteLoader();
