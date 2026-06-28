/**
 * Core game state types for the fighting game
 * All values use integers for deterministic simulation (positions are * 100 for sub-pixel precision)
 */

export type RelativeDirection = 'N' | 'D' | 'F' | 'B' | 'DF' | 'DB' | 'UF' | 'UB';

export enum CharacterState {
  IDLE = 'IDLE',
  WALK_FORWARD = 'WALK_FORWARD',
  WALK_BACKWARD = 'WALK_BACKWARD',
  CROUCH = 'CROUCH',
  JUMP_START = 'JUMP_START',
  JUMP_UP = 'JUMP_UP',
  JUMP_FORWARD = 'JUMP_FORWARD',
  JUMP_BACKWARD = 'JUMP_BACKWARD',
  JUMP_FALL = 'JUMP_FALL',
  JUMP_LIGHT_PUNCH = 'JUMP_LIGHT_PUNCH',
  JUMP_HEAVY_PUNCH = 'JUMP_HEAVY_PUNCH',
  JUMP_LIGHT_KICK = 'JUMP_LIGHT_KICK',
  JUMP_HEAVY_KICK = 'JUMP_HEAVY_KICK',
  LANDING = 'LANDING',
  STAND_GUARD = 'STAND_GUARD',
  CROUCH_GUARD = 'CROUCH_GUARD',
  STAND_LIGHT_PUNCH = 'STAND_LIGHT_PUNCH',
  STAND_HEAVY_PUNCH = 'STAND_HEAVY_PUNCH',
  STAND_LIGHT_KICK = 'STAND_LIGHT_KICK',
  STAND_HEAVY_KICK = 'STAND_HEAVY_KICK',
  CROUCH_LIGHT_PUNCH = 'CROUCH_LIGHT_PUNCH',
  CROUCH_HEAVY_PUNCH = 'CROUCH_HEAVY_PUNCH',
  CROUCH_LIGHT_KICK = 'CROUCH_LIGHT_KICK',
  CROUCH_HEAVY_KICK = 'CROUCH_HEAVY_KICK',
  SPECIAL_1 = 'SPECIAL_1',
  HIT_STUN = 'HIT_STUN',
  HIT_STUN_LIGHT = 'HIT_STUN_LIGHT',
  HIT_STUN_HEAVY = 'HIT_STUN_HEAVY',
  BLOCK_STUN = 'BLOCK_STUN',
  KNOCKDOWN = 'KNOCKDOWN',
  GET_UP = 'GET_UP',
  DASH_FORWARD = 'DASH_FORWARD',
  DASH_BACKWARD = 'DASH_BACKWARD',
}

export type AirJumpKind = 'hop' | 'normal' | 'hyper_hop' | 'hyper_jump';

export interface Vector2 {
  x: number;
  y: number;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  lightPunch: boolean;
  heavyPunch: boolean;
  lightKick: boolean;
  heavyKick: boolean;
}

export const DEFAULT_INPUT: InputState = {
  up: false,
  down: false,
  left: false,
  right: false,
  lightPunch: false,
  heavyPunch: false,
  lightKick: false,
  heavyKick: false,
};

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlayerState {
  position: Vector2;
  velocity: Vector2;
  health: number;
  maxHealth: number;
  state: CharacterState;
  stateFrame: number;
  facingRight: boolean;
  input: InputState;
  previousInput: InputState;
  hitstun: number;
  blockstun: number;
  /** Remaining invulnerability frames (wakeup, etc.) */
  invincibleFrames: number;
  isGrounded: boolean;
  canCancel: boolean;
  airJumpKind: AirJumpKind;
  upHoldDuringJumpStart: number;
  jumpIntentHop: boolean;
  jumpFromDash: boolean;
  hyperMotionReady: boolean;
  lastForwardTapFrame: number;
  lastBackwardTapFrame: number;
  downPressFrame: number;
  airJumpNeutral: boolean;
  jumpWithForward: boolean;
  jumpWithBackward: boolean;
  /** Only one air normal per jump (classic FG rule) */
  airAttackUsed: boolean;
  /** Frames without input while standing idle (2s fidget trigger) */
  /** True after this attack instance has connected (one hit per technique) */
  attackHitLanded: boolean;
  /** Hit while airborne — knockdown on landing if still in hitstun (KOF98) */
  airHitPending: boolean;
  /** Multi-hit attacks (e.g. dropkick) — hits connected so far */
  attackHitsLanded: number;
  /** Last frame each attack button was pressed (for link input buffer) */
  lightPunchPressFrame: number;
  heavyPunchPressFrame: number;
  lightKickPressFrame: number;
  heavyKickPressFrame: number;
  idleTimer: number;
  /** Playing idle fidget animation (frames 00–08) */
  idleFidgetActive: boolean;
  /** Current fidget sprite index (0–8) */
  idleFidgetIndex: number;
  /** Tick counter within current fidget sprite frame */
  idleFidgetTick: number;
  /** Recent directional inputs for motion commands (236, etc.) */
  directionHistory: RelativeDirection[];
}

export interface Projectile {
  id: number;
  owner: number;
  position: Vector2;
  velocity: Vector2;
  active: boolean;
  hitbox: Box;
  damage: number;
  lifetime: number;
}

export interface GameState {
  frameNumber: number;
  players: [PlayerState, PlayerState];
  projectiles: Projectile[];
  rngSeed: number;
  roundTimer: number;
  roundNumber: number;
  roundWins: [number, number];
  isPaused: boolean;
  isRoundOver: boolean;
  winner: number | null;
  /** Counts frames since round ended (for auto-advance) */
  roundEndTimer: number;
  isMatchOver: boolean;
  /** Frames since current round intro started (ROUND / FIGHT) */
  roundIntroTimer: number;
  /** Consecutive unblocked hits landed on opponent by each player */
  comboCounts: [number, number];
  /** Combo count lingered on HUD after opponent stun ends */
  comboDisplayCount: [number, number];
  /** Frame until linger display hides (0.3s after stun release) */
  comboDisplayUntilFrame: [number, number];
  /** Frames remaining to freeze simulation on hit (both players) */
  hitstopRemaining: number;
}

const STAGE_HEIGHT = 72000;
const STAGE_GROUND_RATIO = 0.1;
/** Viewport width (what we see on screen) - stage can be wider */
const VIEWPORT_WIDTH = 128000;
/** Visual + collision scale for characters */
const CHARACTER_SCALE = 1.2;

export const GAME_CONFIG = {
  /** Full stage width (can scroll) - 1.5x viewport for scrolling room */
  STAGE_WIDTH: Math.round(VIEWPORT_WIDTH * 1.5),
  STAGE_HEIGHT,
  /** Visible area width */
  VIEWPORT_WIDTH,
  VIEWPORT_HEIGHT: STAGE_HEIGHT,
  /** Floor band = bottom fraction of stage; feet stand on the top edge of that band. */
  STAGE_GROUND_RATIO,
  GROUND_Y: STAGE_HEIGHT - Math.round(STAGE_HEIGHT * STAGE_GROUND_RATIO),
  // USFIV Ryu reference: 4f pre-jump + ~36f airborne. Tuned for ~40f full jump at 60fps.
  GRAVITY_RISE: 100,
  GRAVITY_FALL: 160,
  WALK_SPEED: 400,
  BACK_WALK_SPEED: 320,
  JUMP_STARTUP_FRAMES: 4,
  JUMP_HOP_MAX_UP_FRAMES: 4,
  /** Short hop apex as a fraction of full jump height (0.5 = half). */
  JUMP_HOP_HEIGHT_RATIO: 0.5,
  /** Horizontal travel distance as a fraction of stage width (forward/backward jumps). */
  JUMP_TRAVEL_RATIO_NORMAL: 1 / 3,
  JUMP_TRAVEL_RATIO_HYPER_JUMP: 2 / 3,
  JUMP_TRAVEL_RATIO_HOP: 1 / 4,
  JUMP_TRAVEL_RATIO_HYPER_HOP: 1 / 2,
  /** Full jump apex = standing height × this (1.08 ≈ slightly above character). */
  JUMP_FULL_APEX_ABOVE_CHARACTER_RATIO: 1.08,
  DASH_SPEED: 900,
  DASH_TAP_WINDOW: 15,
  /** Backdash vertical height as a fraction of hop height (0.5 = half) */
  BACKDASH_JUMP_HEIGHT_RATIO: 0.5,
  /** Dropkick hop height as a fraction of full jump apex (~16% ≈ short skim) */
  DROPKICK_HEIGHT_RATIO: 0.16,
  /** Dropkick horizontal travel as a fraction of full stage width */
  DROPKICK_TRAVEL_RATIO: 1 / 3,
  /** Hits per dropkick (3 COMBO from one command) */
  DROPKICK_HIT_COUNT: 3,
  /** 3rd-hit knockback — matches stand heavy kick push */
  DROPKICK_FINISHER_KNOCKBACK: 500,
  /** Frames of full-speed slide on knockdown finisher (like heavy hitstun) */
  DROPKICK_FINISHER_SLIDE_FRAMES: 20,
  HYPER_DOWN_UP_WINDOW: 14,
  // All long jumps use the same vertical force (apex = character height × 1.08)
  JUMP_FORCE_FULL: -2579,
  MAX_HEALTH: 1000,
  ROUND_TIME: 99 * 60,
  ROUNDS_TO_WIN: 2,
  /** Frames to show round result before next round (60fps × 3s) */
  ROUND_END_DELAY_FRAMES: 180,
  /** Frames to show "N COMBO!" after opponent stun ends (60fps × 0.3s) */
  COMBO_DISPLAY_FRAMES: 18,
  /** Hit freeze on connect — extends combo link windows (SF-style) */
  HITSTOP_LIGHT_FRAMES: 3,
  HITSTOP_HEAVY_FRAMES: 5,
  HITSTOP_BLOCK_FRAMES: 2,
  /** Attack inputs buffered during recovery for link timing */
  ATTACK_INPUT_BUFFER_FRAMES: 4,
  /** Wider buffer for jump-in → grounded normal links (SF-style) */
  JUMP_LINK_INPUT_BUFFER_FRAMES: 10,
  /** Landing recovery after a jump attack touches the ground (SF6: 3f) */
  JUMP_LANDING_RECOVERY_FRAMES: 3,
  /** Small upward pop when hit while airborne (KOF98 air reset) */
  AIR_HIT_BOUNCE_VELOCITY: -550,
  /** Minimum downward speed when air knockdown starts */
  AIR_HIT_FALL_VELOCITY: 350,
  /** Wider attack buffer when special-canceling off a confirmed normal */
  SPECIAL_CANCEL_INPUT_BUFFER_FRAMES: 8,
  /** Frames of directional input kept for motion commands */
  MOTION_INPUT_HISTORY_FRAMES: 18,
  /** "ROUND N!" display duration */
  ROUND_ANNOUNCE_FRAMES: 90,
  /** "FIGHT!" display duration after announce */
  ROUND_FIGHT_FRAMES: 45,
  /** Idle fidget: wait 2s with no input before playing frames 00–08 */
  IDLE_FIDGET_DELAY_FRAMES: 120,
  IDLE_FIDGET_FRAME_DURATION: 8,
  // Classic FG ratio: standing height ~44% of 720p (SF Alpha Ryu: 100px / 224px ≈ 45%)
  CHARACTER_SCALE,
  SPRITE_TARGET_HEIGHT: Math.round(32000 * CHARACTER_SCALE),
  // Push box (green): narrower, only torso/legs - for character collision
  PUSH_BOX_WIDTH: Math.round(10000 * CHARACTER_SCALE),
  PUSH_BOX_HEIGHT: Math.round(24000 * CHARACTER_SCALE),
  // Hurtbox (blue): full body coverage - where attacks land
  HURTBOX_WIDTH: Math.round(16000 * CHARACTER_SCALE),
  HURTBOX_HEIGHT: Math.round(32000 * CHARACTER_SCALE),
  ATTACK_REACH: Math.round(21000 * CHARACTER_SCALE),
  ATTACK_HEIGHT: Math.round(16000 * CHARACTER_SCALE),
  ATTACK_FORWARD_OFFSET: Math.round(8000 * CHARACTER_SCALE),
  ATTACK_STAND_OFFSET_Y: Math.round(21000 * CHARACTER_SCALE),
  ATTACK_CROUCH_OFFSET_Y: Math.round(10500 * CHARACTER_SCALE),
  /** Jump normals — hitbox relative to feet while airborne */
  ATTACK_JUMP_PUNCH_OFFSET_Y: Math.round(18000 * CHARACTER_SCALE),
  ATTACK_JUMP_KICK_OFFSET_Y: Math.round(12000 * CHARACTER_SCALE),
  /** frameData.knockback → per-hit position push */
  KNOCKBACK_DISTANCE_SCALE: 12,
  /** frameData.knockback → per-frame slide during hit/block stun */
  KNOCKBACK_VELOCITY_SCALE: 3,
  /** Combo follow-up hit: fraction of instant push (first hit uses 1.0) */
  COMBO_KNOCKBACK_DISTANCE_SCALE: 0.35,
  /** Combo follow-up hit: fraction of slide speed */
  COMBO_KNOCKBACK_VELOCITY_SCALE: 0.6,
  /** Frames of invulnerability after fully standing up from knockdown */
  WAKEUP_INVINCIBILITY_FRAMES: 1,
  SCALE_FACTOR: 100,
} as const;

export function createInitialPlayerState(playerIndex: number): PlayerState {
  // Start players near center of stage, separated by ~1/3 viewport width
  const stageCenter = GAME_CONFIG.STAGE_WIDTH / 2;
  const separation = GAME_CONFIG.VIEWPORT_WIDTH / 6;
  const startX = playerIndex === 0 ? stageCenter - separation : stageCenter + separation;
  return {
    position: { x: startX, y: GAME_CONFIG.GROUND_Y },
    velocity: { x: 0, y: 0 },
    health: GAME_CONFIG.MAX_HEALTH,
    maxHealth: GAME_CONFIG.MAX_HEALTH,
    state: CharacterState.IDLE,
    stateFrame: 0,
    facingRight: playerIndex === 0,
    input: { ...DEFAULT_INPUT },
    previousInput: { ...DEFAULT_INPUT },
    hitstun: 0,
    blockstun: 0,
    invincibleFrames: 0,
    isGrounded: true,
    canCancel: false,
    airJumpKind: 'normal',
    upHoldDuringJumpStart: 0,
    jumpIntentHop: false,
    jumpFromDash: false,
    hyperMotionReady: false,
    lastForwardTapFrame: -9999,
    lastBackwardTapFrame: -9999,
    downPressFrame: -9999,
    airJumpNeutral: false,
    jumpWithForward: false,
    jumpWithBackward: false,
    airAttackUsed: false,
    attackHitLanded: false,
    attackHitsLanded: 0,
    airHitPending: false,
    lightPunchPressFrame: -9999,
    heavyPunchPressFrame: -9999,
    lightKickPressFrame: -9999,
    heavyKickPressFrame: -9999,
    idleTimer: 0,
    idleFidgetActive: false,
    idleFidgetIndex: 0,
    idleFidgetTick: 0,
    directionHistory: [],
  };
}

export function createInitialGameState(): GameState {
  return {
    frameNumber: 0,
    players: [createInitialPlayerState(0), createInitialPlayerState(1)],
    projectiles: [],
    rngSeed: Date.now(),
    roundTimer: GAME_CONFIG.ROUND_TIME,
    roundNumber: 1,
    roundWins: [0, 0],
    isPaused: false,
    isRoundOver: false,
    winner: null,
    roundEndTimer: 0,
    isMatchOver: false,
    roundIntroTimer: 0,
    comboCounts: [0, 0],
    comboDisplayCount: [0, 0],
    comboDisplayUntilFrame: [0, 0],
    hitstopRemaining: 0,
  };
}

export function hashRoomIdToSeed(roomId: string): number {
  let hash = 0;
  for (let i = 0; i < roomId.length; i++) {
    hash = ((hash << 5) - hash) + roomId.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 1;
}

export function createSyncedOnlineGameState(roomId: string): GameState {
  const state = createInitialGameState();
  state.rngSeed = hashRoomIdToSeed(roomId);
  return state;
}

export type MatchResult = 'p1' | 'p2' | 'draw';

export function getMatchResult(state: GameState): MatchResult | null {
  if (!state.isMatchOver) return null;

  const [p1Wins, p2Wins] = state.roundWins;
  if (
    p1Wins >= GAME_CONFIG.ROUNDS_TO_WIN &&
    p2Wins >= GAME_CONFIG.ROUNDS_TO_WIN
  ) {
    return 'draw';
  }

  return p1Wins > p2Wins ? 'p1' : 'p2';
}

export function isRoundIntroActive(state: GameState): boolean {
  return state.roundIntroTimer < GAME_CONFIG.ROUND_ANNOUNCE_FRAMES + GAME_CONFIG.ROUND_FIGHT_FRAMES;
}

export function getRoundIntroPhase(state: GameState): 'announce' | 'fight' | 'done' {
  if (state.roundIntroTimer < GAME_CONFIG.ROUND_ANNOUNCE_FRAMES) {
    return 'announce';
  }
  if (state.roundIntroTimer < GAME_CONFIG.ROUND_ANNOUNCE_FRAMES + GAME_CONFIG.ROUND_FIGHT_FRAMES) {
    return 'fight';
  }
  return 'done';
}

export function cloneGameState(state: GameState): GameState {
  return {
    frameNumber: state.frameNumber,
    players: [
      { ...state.players[0], 
        position: { ...state.players[0].position },
        velocity: { ...state.players[0].velocity },
        input: { ...state.players[0].input },
        previousInput: { ...state.players[0].previousInput },
        directionHistory: [...state.players[0].directionHistory],
      },
      { ...state.players[1],
        position: { ...state.players[1].position },
        velocity: { ...state.players[1].velocity },
        input: { ...state.players[1].input },
        previousInput: { ...state.players[1].previousInput },
        directionHistory: [...state.players[1].directionHistory],
      },
    ],
    projectiles: state.projectiles.map(p => ({
      ...p,
      position: { ...p.position },
      velocity: { ...p.velocity },
      hitbox: { ...p.hitbox },
    })),
    rngSeed: state.rngSeed,
    roundTimer: state.roundTimer,
    roundNumber: state.roundNumber,
    roundWins: [...state.roundWins] as [number, number],
    isPaused: state.isPaused,
    isRoundOver: state.isRoundOver,
    winner: state.winner,
    roundEndTimer: state.roundEndTimer,
    isMatchOver: state.isMatchOver,
    roundIntroTimer: state.roundIntroTimer,
    comboCounts: [...state.comboCounts] as [number, number],
    comboDisplayCount: [...state.comboDisplayCount] as [number, number],
    comboDisplayUntilFrame: [...state.comboDisplayUntilFrame] as [number, number],
    hitstopRemaining: state.hitstopRemaining,
  };
}

export function serializeGameState(state: GameState): string {
  return JSON.stringify(state);
}

export function deserializeGameState(data: string): GameState {
  return JSON.parse(data) as GameState;
}

export function computeGameStateChecksum(state: GameState): number {
  const serialized = serializeGameState(state);
  let hash = 0;
  for (let i = 0; i < serialized.length; i++) {
    hash = ((hash << 5) - hash) + serialized.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
