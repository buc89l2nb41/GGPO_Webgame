/**
 * Main game update function - processes one frame of game logic
 * This is the core deterministic simulation
 */

import {
  GameState,
  PlayerState,
  InputState,
  CharacterState,
  AirJumpKind,
  GAME_CONFIG,
  cloneGameState,
  createInitialPlayerState,
  isRoundIntroActive,
  Projectile,
} from './GameState';
import { getVerticalJumpVelocity, getHorizontalJumpSpeed, getBackDashVerticalVelocity, getDropkickVerticalVelocity, getDropkickHorizontalSpeed } from './jumpPhysics';
import { 
  applyPhysics, 
  updateFacing,
  isAttackingState,
  isHitState,
  isCrouchingState,
  isAirborneState,
  isJumpAttackState,
  isLightAttackState,
  isHeavyAttackState,
  isDefenderInvulnerable,
  canGuardBlockAttack,
  resolveDefenderBlockStance,
} from '../systems/PhysicsSystem';
import { wasJustPressed, hasAnyInput } from '../systems/InputSystem';
import {
  getRelativeDirection,
  pushDirectionHistory,
  matchesHadouken,
  matchesSpecialCancelMotion,
  hasAttackButtonPressed,
} from '../systems/motionInput';
import { BASE_CHARACTER, getHitbox, getHurtbox, getStateData } from '../data/characters/BaseCharacter';
import { boxesOverlap, applyKnockbackWithCornerPush } from '../systems/PhysicsSystem';

/** Typical 60fps light attack frame data (SF-style) */
const ATTACK_DATA: Record<string, { startup: number; active: number; recovery: number; damage: number; hitstun: number; blockstun: number }> = {
  [CharacterState.STAND_LIGHT_PUNCH]: { startup: 4, active: 2, recovery: 6, damage: 30, hitstun: 14, blockstun: 9 },
  [CharacterState.STAND_HEAVY_PUNCH]: { startup: 7, active: 4, recovery: 14, damage: 70, hitstun: 18, blockstun: 12 },
  [CharacterState.STAND_LIGHT_KICK]: { startup: 5, active: 3, recovery: 8, damage: 50, hitstun: 16, blockstun: 11 },
  [CharacterState.STAND_HEAVY_KICK]: { startup: 10, active: 5, recovery: 20, damage: 80, hitstun: 20, blockstun: 14 },
  [CharacterState.CROUCH_LIGHT_PUNCH]: { startup: 5, active: 2, recovery: 6, damage: 20, hitstun: 14, blockstun: 5 },
  [CharacterState.CROUCH_HEAVY_PUNCH]: { startup: 4, active: 4, recovery: 18, damage: 65, hitstun: 17, blockstun: 11 },
  [CharacterState.CROUCH_LIGHT_KICK]: { startup: 5, active: 2, recovery: 6, damage: 20, hitstun: 14, blockstun: 4 },
  [CharacterState.CROUCH_HEAVY_KICK]: { startup: 9, active: 6, recovery: 22, damage: 90, hitstun: 24, blockstun: 16 },
  // Jump normals — overhead; hitstun tuned for jump-in links (SF6: ~3f land + follow-up startup)
  [CharacterState.JUMP_LIGHT_PUNCH]: { startup: 4, active: 3, recovery: 6, damage: 20, hitstun: 15, blockstun: 8 },
  [CharacterState.JUMP_HEAVY_PUNCH]: { startup: 7, active: 4, recovery: 10, damage: 50, hitstun: 17, blockstun: 11 },
  [CharacterState.JUMP_LIGHT_KICK]: { startup: 5, active: 4, recovery: 8, damage: 25, hitstun: 14, blockstun: 9 },
  [CharacterState.JUMP_HEAVY_KICK]: { startup: 6, active: 5, recovery: 12, damage: 55, hitstun: 18, blockstun: 12 },
  [CharacterState.SPECIAL_1]: { startup: 8, active: 15, recovery: 17, damage: 70, hitstun: 14, blockstun: 12 },
};

export function gameUpdate(state: GameState, inputs: [InputState, InputState]): GameState {
  if (state.isPaused) {
    return state;
  }

  if (state.isRoundOver) {
    return updateAfterRoundEnd(state);
  }

  if (isRoundIntroActive(state)) {
    return updateRoundIntro(state);
  }

  let newState = cloneGameState(state);
  newState.frameNumber++;

  const prevHitstun: [number, number] = [
    state.players[0].hitstun,
    state.players[1].hitstun,
  ];

  newState.players[0].previousInput = { ...newState.players[0].input };
  newState.players[1].previousInput = { ...newState.players[1].input };
  newState.players[0].input = { ...inputs[0] };
  newState.players[1].input = { ...inputs[1] };

  const justPressed: [InputState, InputState] = [
    wasJustPressed(newState.players[0].input, newState.players[0].previousInput),
    wasJustPressed(newState.players[1].input, newState.players[1].previousInput),
  ];

  newState.players[0] = applyInputBuffers(newState.players[0], justPressed[0], newState.frameNumber);
  newState.players[1] = applyInputBuffers(newState.players[1], justPressed[1], newState.frameNumber);

  newState.players[0] = decayInvincibility(newState.players[0]);
  newState.players[1] = decayInvincibility(newState.players[1]);

  if (newState.hitstopRemaining > 0) {
    newState = processSpecialCancels(newState, justPressed);
    newState = processLightChains(newState, justPressed);
    newState.hitstopRemaining--;
    return newState;
  }

  newState.players[0] = updatePlayerState(newState.players[0], 0, newState, justPressed[0]);
  newState.players[1] = updatePlayerState(newState.players[1], 1, newState, justPressed[1]);

  newState = processHits(newState);
  newState = processSpecialCancels(newState, justPressed);
  newState = processLightChains(newState, justPressed);

  newState.players[0] = decayPlayerStun(newState.players[0]);
  newState.players[1] = decayPlayerStun(newState.players[1]);
  newState = applyPhysics(newState);
  newState.players[0] = resolveAirborneLanding(newState.players[0]);
  newState.players[1] = resolveAirborneLanding(newState.players[1]);
  newState = clearComboOnRecovery(newState, prevHitstun);
  newState = updateFacing(newState);
  newState = updateRoundTimer(newState);
  newState = checkRoundEnd(newState);

  return newState;
}

function decayInvincibility(player: PlayerState): PlayerState {
  const frames = player.invincibleFrames ?? 0;
  if (frames <= 0) {
    return player;
  }
  return { ...player, invincibleFrames: frames - 1 };
}

function resetIdleFidget(player: PlayerState): void {
  player.idleTimer = 0;
  player.idleFidgetActive = false;
  player.idleFidgetIndex = 0;
  player.idleFidgetTick = 0;
}

function updateIdleFidget(player: PlayerState): void {
  if (player.state !== CharacterState.IDLE) {
    resetIdleFidget(player);
    return;
  }

  if (hasAnyInput(player.input)) {
    resetIdleFidget(player);
    return;
  }

  if (!player.idleFidgetActive) {
    player.idleTimer++;
    if (player.idleTimer >= GAME_CONFIG.IDLE_FIDGET_DELAY_FRAMES) {
      player.idleFidgetActive = true;
      player.idleFidgetIndex = 0;
      player.idleFidgetTick = 0;
      player.idleTimer = 0;
    }
    return;
  }

  player.idleFidgetTick++;
  if (player.idleFidgetTick >= GAME_CONFIG.IDLE_FIDGET_FRAME_DURATION) {
    player.idleFidgetTick = 0;
    if (player.idleFidgetIndex >= 8) {
      resetIdleFidget(player);
    } else {
      player.idleFidgetIndex++;
    }
  }
}

function updatePlayerState(
  player: PlayerState,
  playerIndex: number,
  state: GameState,
  justPressed: InputState,
): PlayerState {
  const prevState = player.state;
  const newPlayer = { ...player };
  const frameNumber = state.frameNumber;

  if (newPlayer.hitstun > 0) {
    newPlayer.stateFrame++;
    return newPlayer;
  }

  if (newPlayer.blockstun > 0) {
    newPlayer.stateFrame++;
    return newPlayer;
  }

  if (isAttackingState(newPlayer.state)) {
    const attackData = ATTACK_DATA[newPlayer.state];
    if (attackData) {
      const totalFrames = attackData.startup + attackData.active + attackData.recovery;

      if (
        newPlayer.stateFrame < totalFrames &&
        canCancelIntoSpecial(newPlayer, state, playerIndex, attackData)
      ) {
        const bufferedPress = getSpecialCancelBufferedPress(newPlayer, justPressed, frameNumber);
        if (trySpecialMoveCancel(newPlayer, bufferedPress)) {
          consumeAttackBuffer(newPlayer, bufferedPress);
          return newPlayer;
        }
      }

      if (
        newPlayer.stateFrame < totalFrames &&
        canChainLightNormal(newPlayer, state, playerIndex, attackData)
      ) {
        const bufferedPress = getSpecialCancelBufferedPress(newPlayer, justPressed, frameNumber);
        if (tryLightChainAttack(newPlayer, bufferedPress)) {
          consumeAttackBuffer(newPlayer, bufferedPress);
          return newPlayer;
        }
      }

      if (newPlayer.stateFrame >= totalFrames) {
        const jumpLinkPress = getJumpLinkBufferedPress(newPlayer, justPressed, frameNumber);
        if (isJumpAttackState(newPlayer.state) && tryJumpInLink(newPlayer, jumpLinkPress, frameNumber)) {
          consumeAttackBuffer(newPlayer, jumpLinkPress);
          return newPlayer;
        }

        const bufferedPress = getBufferedAttackJustPressed(newPlayer, justPressed, frameNumber);
        if (tryGroundedAttack(newPlayer, bufferedPress, newPlayer.input.down, frameNumber)) {
          consumeAttackBuffer(newPlayer, bufferedPress);
          return newPlayer;
        }

        if (isJumpAttackState(newPlayer.state) || newPlayer.state === CharacterState.SPECIAL_1) {
          newPlayer.state = newPlayer.isGrounded
            ? CharacterState.IDLE
            : CharacterState.JUMP_FALL;
        } else {
          newPlayer.state = newPlayer.input.down ? CharacterState.CROUCH : CharacterState.IDLE;
        }
        newPlayer.stateFrame = 0;
      } else {
        if (newPlayer.state === CharacterState.SPECIAL_1) {
          applyDropkickVelocity(newPlayer);
        }
        newPlayer.stateFrame++;
        return newPlayer;
      }
    }
  }

  switch (newPlayer.state) {
    case CharacterState.IDLE:
    case CharacterState.WALK_FORWARD:
    case CharacterState.WALK_BACKWARD:
      if (newPlayer.state === CharacterState.IDLE) {
        if (tryJumpInLink(newPlayer, justPressed, frameNumber)) {
          consumeAttackBuffer(newPlayer, getJumpLinkBufferedPress(newPlayer, justPressed, frameNumber));
          return newPlayer;
        }

        if (onEnterIdle(newPlayer, prevState, frameNumber)) {
          return newPlayer;
        }
      }

      newPlayer.velocity.x = 0;
      
      if (tryStartJump(newPlayer, justPressed, false)) {
        return newPlayer;
      }

      if (tryStartDash(newPlayer, justPressed, frameNumber)) {
        return newPlayer;
      }

      if (tryStartBackDash(newPlayer, justPressed, frameNumber)) {
        return newPlayer;
      }
      
      if (player.input.down) {
        newPlayer.state = CharacterState.CROUCH;
        newPlayer.stateFrame = 0;
        return newPlayer;
      }

      {
        const bufferedPress = getBufferedAttackJustPressed(newPlayer, justPressed, frameNumber);
        if (tryGroundedAttack(newPlayer, bufferedPress, false, frameNumber)) {
          consumeAttackBuffer(newPlayer, bufferedPress);
          return newPlayer;
        }
      }

      if (checkGuard(newPlayer, playerIndex, state)) {
        newPlayer.state = CharacterState.STAND_GUARD;
        newPlayer.stateFrame = 0;
        return newPlayer;
      }
      
      if (player.input.right) {
        // Right = always move right (+x), speed depends on forward/backward relative to facing
        const isForward = newPlayer.facingRight;
        newPlayer.velocity.x = isForward ? GAME_CONFIG.WALK_SPEED : GAME_CONFIG.BACK_WALK_SPEED;
        newPlayer.state = isForward ? CharacterState.WALK_FORWARD : CharacterState.WALK_BACKWARD;
      } else if (player.input.left) {
        // Left = always move left (-x), speed depends on forward/backward relative to facing
        const isForward = !newPlayer.facingRight;
        newPlayer.velocity.x = isForward ? -GAME_CONFIG.WALK_SPEED : -GAME_CONFIG.BACK_WALK_SPEED;
        newPlayer.state = isForward ? CharacterState.WALK_FORWARD : CharacterState.WALK_BACKWARD;
      } else {
        newPlayer.state = CharacterState.IDLE;
      }
      break;

    case CharacterState.DASH_FORWARD:
      if (tryStartJump(newPlayer, justPressed, true)) {
        return newPlayer;
      }

      if (player.input.down) {
        newPlayer.state = CharacterState.CROUCH;
        newPlayer.stateFrame = 0;
        newPlayer.velocity.x = 0;
        return newPlayer;
      }

      {
        const bufferedPress = getBufferedAttackJustPressed(newPlayer, justPressed, frameNumber);
        if (tryGroundedAttack(newPlayer, bufferedPress, false, frameNumber)) {
          consumeAttackBuffer(newPlayer, bufferedPress);
          newPlayer.velocity.x = 0;
          return newPlayer;
        }
      }

      if (!isForwardInput(player)) {
        newPlayer.state = CharacterState.IDLE;
        newPlayer.stateFrame = 0;
        newPlayer.velocity.x = 0;
        if (onEnterIdle(newPlayer, prevState, frameNumber)) {
          return newPlayer;
        }
        return newPlayer;
      }

      newPlayer.velocity.x = newPlayer.facingRight
        ? GAME_CONFIG.DASH_SPEED
        : -GAME_CONFIG.DASH_SPEED;
      break;

    case CharacterState.CROUCH:
      newPlayer.velocity.x = 0;

      if (justPressed.up) {
        beginJumpStartup(newPlayer, true, false, justPressed);
        return newPlayer;
      }
      
      if (!player.input.down) {
        newPlayer.state = CharacterState.IDLE;
        newPlayer.stateFrame = 0;
        return newPlayer;
      }

      {
        const bufferedPress = getBufferedAttackJustPressed(newPlayer, justPressed, frameNumber);
        if (tryGroundedAttack(newPlayer, bufferedPress, true, frameNumber)) {
          consumeAttackBuffer(newPlayer, bufferedPress);
          return newPlayer;
        }
      }

      if (checkGuard(newPlayer, playerIndex, state)) {
        newPlayer.state = CharacterState.CROUCH_GUARD;
        newPlayer.stateFrame = 0;
        return newPlayer;
      }
      break;

    case CharacterState.STAND_GUARD:
    case CharacterState.CROUCH_GUARD:
      if (!checkGuard(newPlayer, playerIndex, state)) {
        newPlayer.state = player.input.down ? CharacterState.CROUCH : CharacterState.IDLE;
        newPlayer.stateFrame = 0;
      }
      break;

    case CharacterState.JUMP_START:
      if (!player.input.up) {
        newPlayer.jumpIntentHop = true;
      } else {
        newPlayer.upHoldDuringJumpStart++;
      }

      if (isForwardDirectionInput(player, player.input)) {
        newPlayer.jumpWithForward = true;
        newPlayer.jumpWithBackward = false;
      } else if (isBackwardDirectionInput(player, player.input)) {
        newPlayer.jumpWithBackward = true;
        newPlayer.jumpWithForward = false;
      }

      if (newPlayer.stateFrame >= GAME_CONFIG.JUMP_STARTUP_FRAMES) {
        applyJumpTakeoff(newPlayer, player.input);
        newPlayer.stateFrame = 0;
      }
      break;

    case CharacterState.JUMP_UP:
      if (tryAttack(newPlayer, justPressed, false)) {
        return newPlayer;
      }
      if (newPlayer.velocity.y > 0) {
        newPlayer.state = CharacterState.JUMP_FALL;
        newPlayer.stateFrame = 0;
      }
      break;

    case CharacterState.JUMP_FORWARD:
    case CharacterState.JUMP_BACKWARD:
    case CharacterState.DASH_BACKWARD:
      if (tryAttack(newPlayer, justPressed, false)) {
        return newPlayer;
      }
      if (
        newPlayer.state !== CharacterState.DASH_BACKWARD
        && newPlayer.velocity.y > 0
      ) {
        newPlayer.state = CharacterState.JUMP_FALL;
        newPlayer.stateFrame = 0;
      }
      break;

    case CharacterState.JUMP_FALL:
      if (tryAttack(newPlayer, justPressed, false)) {
        return newPlayer;
      }
      break;

    case CharacterState.LANDING:
      if (tryJumpInLink(newPlayer, justPressed, frameNumber)) {
        consumeAttackBuffer(newPlayer, getJumpLinkBufferedPress(newPlayer, justPressed, frameNumber));
        return newPlayer;
      }

      if (newPlayer.stateFrame >= GAME_CONFIG.JUMP_LANDING_RECOVERY_FRAMES) {
        const bufferedPress = getJumpLinkBufferedPress(newPlayer, justPressed, frameNumber);
        if (tryJumpInLink(newPlayer, bufferedPress, frameNumber)) {
          consumeAttackBuffer(newPlayer, bufferedPress);
          return newPlayer;
        }

        newPlayer.state = CharacterState.IDLE;
        newPlayer.stateFrame = 0;
        newPlayer.airJumpKind = 'normal';
        newPlayer.airJumpNeutral = false;
        newPlayer.jumpWithForward = false;
        newPlayer.jumpWithBackward = false;
        newPlayer.airAttackUsed = false;
        newPlayer.attackHitLanded = false;
      }
      break;

    case CharacterState.KNOCKDOWN:
      if (
        newPlayer.velocity.x !== 0
        && newPlayer.stateFrame >= GAME_CONFIG.DROPKICK_FINISHER_SLIDE_FRAMES
      ) {
        const friction = 0.85;
        newPlayer.velocity = {
          ...newPlayer.velocity,
          x: Math.abs(newPlayer.velocity.x) < 25
            ? 0
            : Math.round(newPlayer.velocity.x * friction),
        };
      }
      if (newPlayer.stateFrame >= 30) {
        newPlayer.state = CharacterState.GET_UP;
        newPlayer.stateFrame = 0;
      }
      break;

    case CharacterState.GET_UP:
      if (newPlayer.stateFrame >= 20) {
        newPlayer.state = CharacterState.IDLE;
        newPlayer.stateFrame = 0;
        newPlayer.invincibleFrames = GAME_CONFIG.WAKEUP_INVINCIBILITY_FRAMES;
      }
      break;
  }

  if (newPlayer.state === CharacterState.IDLE && prevState !== CharacterState.IDLE) {
    if (onEnterIdle(newPlayer, prevState, frameNumber)) {
      newPlayer.stateFrame++;
      return newPlayer;
    }
  }
  updateIdleFidget(newPlayer);

  newPlayer.stateFrame++;
  return newPlayer;
}

function applyInputBuffers(
  player: PlayerState,
  justPressed: InputState,
  frameNumber: number,
): PlayerState {
  const newPlayer = { ...player };
  updateInputBuffers(newPlayer, justPressed, frameNumber);
  return newPlayer;
}

function processSpecialCancels(
  state: GameState,
  justPressed: [InputState, InputState],
): GameState {
  const newState = {
    ...state,
    players: [
      { ...state.players[0] },
      { ...state.players[1] },
    ] as [PlayerState, PlayerState],
  };

  for (let playerIdx = 0; playerIdx < 2; playerIdx++) {
    const player = newState.players[playerIdx];
    const attackData = ATTACK_DATA[player.state];
    if (!attackData) continue;
    if (!canCancelIntoSpecial(player, newState, playerIdx, attackData)) continue;

    const bufferedPress = getSpecialCancelBufferedPress(
      player,
      justPressed[playerIdx],
      state.frameNumber,
    );
    if (trySpecialMoveCancel(player, bufferedPress)) {
      consumeAttackBuffer(player, bufferedPress);
    }
  }

  return newState;
}

function processLightChains(
  state: GameState,
  justPressed: [InputState, InputState],
): GameState {
  const newState = {
    ...state,
    players: [
      { ...state.players[0] },
      { ...state.players[1] },
    ] as [PlayerState, PlayerState],
  };

  for (let playerIdx = 0; playerIdx < 2; playerIdx++) {
    const player = newState.players[playerIdx];
    const attackData = ATTACK_DATA[player.state];
    if (!attackData) continue;
    if (!canChainLightNormal(player, newState, playerIdx, attackData)) continue;

    const bufferedPress = getSpecialCancelBufferedPress(
      player,
      justPressed[playerIdx],
      state.frameNumber,
    );
    if (tryLightChainAttack(player, bufferedPress)) {
      consumeAttackBuffer(player, bufferedPress);
    }
  }

  return newState;
}

function getSpecialCancelBufferedPress(
  player: PlayerState,
  justPressed: InputState,
  frameNumber: number,
): InputState {
  const buffer = GAME_CONFIG.SPECIAL_CANCEL_INPUT_BUFFER_FRAMES;
  const within = (pressFrame: number) =>
    pressFrame >= 0 && frameNumber - pressFrame <= buffer;

  return {
    up: justPressed.up,
    down: justPressed.down,
    left: justPressed.left,
    right: justPressed.right,
    lightPunch: justPressed.lightPunch || within(player.lightPunchPressFrame),
    heavyPunch: justPressed.heavyPunch || within(player.heavyPunchPressFrame),
    lightKick: justPressed.lightKick || within(player.lightKickPressFrame),
    heavyKick: justPressed.heavyKick || within(player.heavyKickPressFrame),
  };
}

function updateInputBuffers(
  player: PlayerState,
  justPressed: InputState,
  frameNumber: number
): void {
  const dir = getRelativeDirection(player.input, player.facingRight);
  player.directionHistory = pushDirectionHistory(
    player.directionHistory,
    dir,
    GAME_CONFIG.MOTION_INPUT_HISTORY_FRAMES,
  );

  if (justPressed.down) {
    player.downPressFrame = frameNumber;
  }

  if (justPressed.up) {
    const downRecent = frameNumber - player.downPressFrame <= GAME_CONFIG.HYPER_DOWN_UP_WINDOW;
    const wasCrouching = player.input.down || isCrouchingState(player.state);
    player.hyperMotionReady = downRecent || wasCrouching;
  }

  if (justPressed.lightPunch) player.lightPunchPressFrame = frameNumber;
  if (justPressed.heavyPunch) player.heavyPunchPressFrame = frameNumber;
  if (justPressed.lightKick) player.lightKickPressFrame = frameNumber;
  if (justPressed.heavyKick) player.heavyKickPressFrame = frameNumber;
}

function decayPlayerStun(player: PlayerState): PlayerState {
  const newPlayer = { ...player };

  if (newPlayer.hitstun > 0) {
    newPlayer.hitstun--;
    if (newPlayer.hitstun === 0) {
      newPlayer.airHitPending = false;
      newPlayer.state = newPlayer.isGrounded ? CharacterState.IDLE : CharacterState.JUMP_FALL;
      newPlayer.stateFrame = 0;
    }
    return newPlayer;
  }

  if (newPlayer.blockstun > 0) {
    newPlayer.blockstun--;
    if (newPlayer.blockstun === 0) {
      if (newPlayer.isGrounded) {
        newPlayer.state = isCrouchingState(newPlayer.state) ? CharacterState.CROUCH : CharacterState.IDLE;
      } else {
        newPlayer.state = CharacterState.JUMP_FALL;
      }
      newPlayer.stateFrame = 0;
    }
    return newPlayer;
  }

  return newPlayer;
}

function canCancelIntoSpecial(
  player: PlayerState,
  state: GameState,
  playerIdx: number,
  attackData: { startup: number; active: number; recovery: number },
): boolean {
  if (!player.attackHitLanded) return false;

  const stateData = getStateData(BASE_CHARACTER, player.state);
  if (!stateData?.frameData?.canCancel) return false;

  const defender = state.players[1 - playerIdx];
  if (defender.hitstun <= 0 && !isHitState(defender.state)) return false;

  const totalFrames = attackData.startup + attackData.active + attackData.recovery;
  return player.stateFrame >= attackData.startup && player.stateFrame < totalFrames;
}

function canChainLightNormal(
  player: PlayerState,
  _state: GameState,
  _playerIdx: number,
  attackData: { startup: number; active: number; recovery: number },
): boolean {
  if (!player.attackHitLanded) return false;
  if (!isLightAttackState(player.state)) return false;

  const totalFrames = attackData.startup + attackData.active + attackData.recovery;
  // Chain only during recovery — active frames always play out (SF-style gatling)
  return player.stateFrame >= attackData.startup + attackData.active
    && player.stateFrame < totalFrames;
}

function resolveLightChainTarget(
  justPressed: InputState,
  wantCrouch: boolean,
): CharacterState | null {
  if (justPressed.lightPunch) {
    return wantCrouch
      ? CharacterState.CROUCH_LIGHT_PUNCH
      : CharacterState.STAND_LIGHT_PUNCH;
  }
  if (justPressed.lightKick) {
    return wantCrouch
      ? CharacterState.CROUCH_LIGHT_KICK
      : CharacterState.STAND_LIGHT_KICK;
  }
  return null;
}

function canGatlingInto(attackerState: CharacterState, targetState: CharacterState): boolean {
  return isLightAttackState(attackerState) && isLightAttackState(targetState);
}

function tryLightChainAttack(
  player: PlayerState,
  justPressed: InputState,
): boolean {
  const wantCrouch = player.input.down;
  const target = resolveLightChainTarget(justPressed, wantCrouch);
  if (!target || !canGatlingInto(player.state, target)) {
    return false;
  }
  return tryAttack(player, justPressed, wantCrouch);
}

function getJumpLinkBufferedPress(
  player: PlayerState,
  justPressed: InputState,
  frameNumber: number,
): InputState {
  const buffer = GAME_CONFIG.JUMP_LINK_INPUT_BUFFER_FRAMES;
  const within = (pressFrame: number) =>
    pressFrame >= 0 && frameNumber - pressFrame <= buffer;

  return {
    up: justPressed.up,
    down: justPressed.down,
    left: justPressed.left,
    right: justPressed.right,
    lightPunch: justPressed.lightPunch || within(player.lightPunchPressFrame),
    heavyPunch: justPressed.heavyPunch || within(player.heavyPunchPressFrame),
    lightKick: justPressed.lightKick || within(player.lightKickPressFrame),
    heavyKick: justPressed.heavyKick || within(player.heavyKickPressFrame),
  };
}

function hasJumpLinkAttackBuffered(player: PlayerState, frameNumber: number): boolean {
  if (!player.attackHitLanded) return false;
  const press = getJumpLinkBufferedPress(player, {
    up: false,
    down: false,
    left: false,
    right: false,
    lightPunch: false,
    heavyPunch: false,
    lightKick: false,
    heavyKick: false,
  }, frameNumber);
  return hasAttackButtonPressed(press);
}

function tryJumpInLink(
  player: PlayerState,
  justPressed: InputState,
  frameNumber: number,
): boolean {
  if (!player.attackHitLanded) return false;

  const bufferedPress = getJumpLinkBufferedPress(player, justPressed, frameNumber);
  if (!hasAttackButtonPressed(bufferedPress)) return false;
  if (!tryGroundedAttack(player, bufferedPress, player.input.down, frameNumber)) {
    return false;
  }

  player.attackHitLanded = false;
  return true;
}

function getBufferedAttackJustPressed(
  player: PlayerState,
  justPressed: InputState,
  frameNumber: number,
): InputState {
  const buffer = GAME_CONFIG.ATTACK_INPUT_BUFFER_FRAMES;
  const within = (pressFrame: number) =>
    pressFrame >= 0 && frameNumber - pressFrame <= buffer;

  return {
    up: justPressed.up,
    down: justPressed.down,
    left: justPressed.left,
    right: justPressed.right,
    lightPunch: justPressed.lightPunch || within(player.lightPunchPressFrame),
    heavyPunch: justPressed.heavyPunch || within(player.heavyPunchPressFrame),
    lightKick: justPressed.lightKick || within(player.lightKickPressFrame),
    heavyKick: justPressed.heavyKick || within(player.heavyKickPressFrame),
  };
}

function consumeAttackBuffer(player: PlayerState, pressed: InputState): void {
  if (pressed.lightPunch) player.lightPunchPressFrame = -9999;
  if (pressed.heavyPunch) player.heavyPunchPressFrame = -9999;
  if (pressed.lightKick) player.lightKickPressFrame = -9999;
  if (pressed.heavyKick) player.heavyKickPressFrame = -9999;
}

function getHitstopFrames(attackerState: CharacterState, blocked: boolean): number {
  if (blocked) return GAME_CONFIG.HITSTOP_BLOCK_FRAMES;
  if (isHeavyAttackState(attackerState)) return GAME_CONFIG.HITSTOP_HEAVY_FRAMES;
  return GAME_CONFIG.HITSTOP_LIGHT_FRAMES;
}

function isForwardInput(player: PlayerState): boolean {
  return player.facingRight ? player.input.right : player.input.left;
}

function isForwardDirectionInput(player: PlayerState, input: InputState): boolean {
  return player.facingRight
    ? input.right && !input.left
    : input.left && !input.right;
}

function isBackwardDirectionInput(player: PlayerState, input: InputState): boolean {
  return player.facingRight
    ? input.left && !input.right
    : input.right && !input.left;
}

function forwardJustPressed(player: PlayerState, justPressed: InputState): boolean {
  return player.facingRight ? justPressed.right : justPressed.left;
}

function backwardJustPressed(player: PlayerState, justPressed: InputState): boolean {
  return player.facingRight ? justPressed.left : justPressed.right;
}

function latchJumpDirection(player: PlayerState, input: InputState, justPressed?: InputState): void {
  player.jumpWithForward = isForwardDirectionInput(player, input);
  player.jumpWithBackward = isBackwardDirectionInput(player, input);

  if (!justPressed) {
    return;
  }

  if (justPressed.up && forwardJustPressed(player, justPressed)) {
    player.jumpWithForward = true;
    player.jumpWithBackward = false;
  } else if (justPressed.up && (player.facingRight ? justPressed.left : justPressed.right)) {
    player.jumpWithBackward = true;
    player.jumpWithForward = false;
  } else if (justPressed.up && (justPressed.right || justPressed.left)) {
    if (justPressed.right && !justPressed.left) {
      player.jumpWithForward = player.facingRight;
      player.jumpWithBackward = !player.facingRight;
    } else if (justPressed.left && !justPressed.right) {
      player.jumpWithForward = !player.facingRight;
      player.jumpWithBackward = player.facingRight;
    }
  }
}

function beginJumpStartup(
  player: PlayerState,
  fromCrouch: boolean,
  fromDash = false,
  justPressed?: InputState
): void {
  player.state = CharacterState.JUMP_START;
  player.stateFrame = 0;
  player.airAttackUsed = false;
  player.upHoldDuringJumpStart = 0;
  player.jumpIntentHop = false;
  player.jumpFromDash = fromDash;
  latchJumpDirection(player, player.input, justPressed);
  if (fromCrouch) {
    player.hyperMotionReady = true;
  }
}

function tryStartJump(
  player: PlayerState,
  justPressed: InputState,
  fromDash: boolean
): boolean {
  if (!justPressed.up) {
    return false;
  }

  beginJumpStartup(player, false, fromDash, justPressed);
  return true;
}

function tryStartJumpFromHeldInput(player: PlayerState): boolean {
  if (!player.input.up || player.input.down) {
    return false;
  }

  beginJumpStartup(player, false, false);
  return true;
}

function onEnterIdle(
  player: PlayerState,
  prevState: CharacterState,
  frameNumber: number,
): boolean {
  if (prevState === CharacterState.IDLE) {
    return false;
  }

  resetIdleFidget(player);
  if (prevState === CharacterState.LANDING && hasJumpLinkAttackBuffered(player, frameNumber)) {
    return false;
  }
  return tryStartJumpFromHeldInput(player);
}

function tryStartDash(
  player: PlayerState,
  justPressed: InputState,
  frameNumber: number
): boolean {
  if (!forwardJustPressed(player, justPressed)) {
    return false;
  }

  if (frameNumber - player.lastForwardTapFrame > GAME_CONFIG.DASH_TAP_WINDOW) {
    player.lastForwardTapFrame = frameNumber;
    return false;
  }

  player.lastForwardTapFrame = frameNumber;
  player.state = CharacterState.DASH_FORWARD;
  player.stateFrame = 0;
  player.velocity.x = player.facingRight
    ? GAME_CONFIG.DASH_SPEED
    : -GAME_CONFIG.DASH_SPEED;
  return true;
}

function beginBackDash(player: PlayerState): void {
  const airJumpKind: AirJumpKind = 'hop';
  const speed = getHorizontalJumpSpeed(airJumpKind, 'backward');

  player.state = CharacterState.DASH_BACKWARD;
  player.stateFrame = 0;
  player.isGrounded = false;
  player.airJumpKind = airJumpKind;
  player.airJumpNeutral = false;
  player.jumpWithBackward = true;
  player.jumpWithForward = false;
  player.airAttackUsed = false;
  player.velocity.y = getBackDashVerticalVelocity();
  player.velocity.x = player.facingRight ? -speed : speed;
}

function tryStartBackDash(
  player: PlayerState,
  justPressed: InputState,
  frameNumber: number
): boolean {
  if (!backwardJustPressed(player, justPressed)) {
    return false;
  }

  if (frameNumber - player.lastBackwardTapFrame > GAME_CONFIG.DASH_TAP_WINDOW) {
    player.lastBackwardTapFrame = frameNumber;
    return false;
  }

  player.lastBackwardTapFrame = frameNumber;
  beginBackDash(player);
  return true;
}

function resolveAirJumpKind(player: PlayerState): AirJumpKind {
  const isFullJump = !player.jumpIntentHop
    && player.upHoldDuringJumpStart > GAME_CONFIG.JUMP_HOP_MAX_UP_FRAMES;
  const isHop = !isFullJump;
  const isHyper = player.jumpFromDash || player.hyperMotionReady;

  if (isHyper && isHop) return 'hyper_hop';
  if (isHyper) return 'hyper_jump';
  if (isHop) return 'hop';
  return 'normal';
}

function applyJumpTakeoff(player: PlayerState, _input: InputState): void {
  const airJumpKind = resolveAirJumpKind(player);
  player.airJumpKind = airJumpKind;
  player.isGrounded = false;
  player.jumpFromDash = false;
  player.hyperMotionReady = false;
  player.jumpIntentHop = false;
  player.upHoldDuringJumpStart = 0;

  const movingForward = player.jumpWithForward;
  const movingBackward = player.jumpWithBackward;
  const jumpDirection: 'neutral' | 'forward' | 'backward' = movingForward
    ? 'forward'
    : movingBackward
      ? 'backward'
      : 'neutral';

  player.velocity.y = getVerticalJumpVelocity(airJumpKind, jumpDirection);

  if (jumpDirection === 'forward') {
    const speed = getHorizontalJumpSpeed(airJumpKind, 'forward');
    player.velocity.x = player.facingRight ? speed : -speed;
    player.state = CharacterState.JUMP_FORWARD;
    player.airJumpNeutral = false;
    return;
  }

  if (jumpDirection === 'backward') {
    const speed = getHorizontalJumpSpeed(airJumpKind, 'backward');
    player.velocity.x = player.facingRight ? -speed : speed;
    player.state = CharacterState.JUMP_BACKWARD;
    player.airJumpNeutral = false;
    return;
  }

  const isHop = airJumpKind === 'hop' || airJumpKind === 'hyper_hop';
  const isHyper = airJumpKind === 'hyper_hop' || airJumpKind === 'hyper_jump';
  if (isHyper && !isHop && player.velocity.x !== 0) {
    const speed = getHorizontalJumpSpeed('hyper_jump', 'forward');
    player.velocity.x = player.facingRight ? speed : -speed;
  } else {
    player.velocity.x = 0;
  }
  player.state = CharacterState.JUMP_UP;
  player.airJumpNeutral = true;
}

function tryGroundedAttack(
  player: PlayerState,
  justPressed: InputState,
  isCrouching: boolean,
  frameNumber: number,
): boolean {
  if (trySpecialMove(player, justPressed, frameNumber)) {
    return true;
  }
  return tryAttack(player, justPressed, isCrouching);
}

function trySpecialMove(player: PlayerState, justPressed: InputState, _frameNumber: number): boolean {
  if (!hasAttackButtonPressed(justPressed)) {
    return false;
  }
  if (isAirborneState(player.state)) {
    return false;
  }
  if (!matchesHadouken(player.directionHistory)) {
    return false;
  }
  return startDropkick(player);
}

function trySpecialMoveCancel(player: PlayerState, justPressed: InputState): boolean {
  if (!hasAttackButtonPressed(justPressed)) {
    return false;
  }
  if (isAirborneState(player.state)) {
    return false;
  }
  const crouching = isCrouchingState(player.state) || player.input.down;
  if (!matchesSpecialCancelMotion(player.directionHistory, { implyCrouchDown: crouching })) {
    return false;
  }
  return startDropkick(player);
}

function startDropkick(player: PlayerState): boolean {
  player.state = CharacterState.SPECIAL_1;
  player.stateFrame = 0;
  player.attackHitLanded = false;
  player.attackHitsLanded = 0;
  player.directionHistory = [];
  const forward = player.facingRight ? 1 : -1;
  const attackData = ATTACK_DATA[CharacterState.SPECIAL_1];
  const baseSpeed = getDropkickHorizontalSpeed(
    attackData.startup,
    attackData.active,
    attackData.recovery,
  );
  player.velocity.x = forward * Math.round(baseSpeed * 0.85);
  player.velocity.y = getDropkickVerticalVelocity();
  player.isGrounded = false;
  return true;
}

function applyDropkickVelocity(player: PlayerState): void {
  const attackData = ATTACK_DATA[CharacterState.SPECIAL_1];
  if (!attackData) {
    return;
  }
  const forward = player.facingRight ? 1 : -1;
  const frame = player.stateFrame;
  const baseSpeed = getDropkickHorizontalSpeed(
    attackData.startup,
    attackData.active,
    attackData.recovery,
  );

  if (frame < attackData.startup) {
    player.velocity.x = forward * Math.round(baseSpeed * 0.85);
  } else if (frame < attackData.startup + attackData.active) {
    player.velocity.x = forward * baseSpeed;
  } else {
    player.velocity.x = 0;
  }
}

function tryAttack(player: PlayerState, justPressed: InputState, isCrouching: boolean): boolean {
  const airborne = isAirborneState(player.state);
  if (airborne) {
    if (player.state === CharacterState.JUMP_START || player.airAttackUsed) {
      return false;
    }
  }

  if (justPressed.lightPunch) {
    player.state = airborne
      ? CharacterState.JUMP_LIGHT_PUNCH
      : isCrouching
        ? CharacterState.CROUCH_LIGHT_PUNCH
        : CharacterState.STAND_LIGHT_PUNCH;
    player.stateFrame = 0;
    player.attackHitLanded = false;
    player.attackHitsLanded = 0;
    if (!airborne) player.velocity.x = 0;
    if (airborne) player.airAttackUsed = true;
    return true;
  }
  if (justPressed.heavyPunch) {
    player.state = airborne
      ? CharacterState.JUMP_HEAVY_PUNCH
      : isCrouching
        ? CharacterState.CROUCH_HEAVY_PUNCH
        : CharacterState.STAND_HEAVY_PUNCH;
    player.stateFrame = 0;
    player.attackHitLanded = false;
    player.attackHitsLanded = 0;
    if (!airborne) player.velocity.x = 0;
    if (airborne) player.airAttackUsed = true;
    return true;
  }
  if (justPressed.lightKick) {
    player.state = airborne
      ? CharacterState.JUMP_LIGHT_KICK
      : isCrouching
        ? CharacterState.CROUCH_LIGHT_KICK
        : CharacterState.STAND_LIGHT_KICK;
    player.stateFrame = 0;
    player.attackHitLanded = false;
    player.attackHitsLanded = 0;
    if (!airborne) player.velocity.x = 0;
    if (airborne) player.airAttackUsed = true;
    return true;
  }
  if (justPressed.heavyKick) {
    player.state = airborne
      ? CharacterState.JUMP_HEAVY_KICK
      : isCrouching
        ? CharacterState.CROUCH_HEAVY_KICK
        : CharacterState.STAND_HEAVY_KICK;
    player.stateFrame = 0;
    player.attackHitLanded = false;
    player.attackHitsLanded = 0;
    if (!airborne) player.velocity.x = 0;
    if (airborne) player.airAttackUsed = true;
    return true;
  }
  return false;
}

function checkGuard(player: PlayerState, playerIndex: number, state: GameState): boolean {
  const opponent = state.players[1 - playerIndex];
  const isOpponentAttacking = isAttackingState(opponent.state);
  
  if (!isOpponentAttacking) return false;

  const holdingBack = player.facingRight ? player.input.left : player.input.right;
  return holdingBack;
}

function resolveAirborneLanding(player: PlayerState): PlayerState {
  if (!player.isGrounded || player.position.y < GAME_CONFIG.GROUND_Y) {
    return player;
  }

  const landingReset = {
    velocity: { x: 0, y: 0 },
    airJumpKind: 'normal' as AirJumpKind,
    airJumpNeutral: false,
    jumpWithForward: false,
    jumpWithBackward: false,
    airAttackUsed: false,
    airHitPending: false,
  };

  if (player.state === CharacterState.LANDING) {
    return player;
  }

  if (player.state === CharacterState.SPECIAL_1) {
    return player;
  }

  if (player.state === CharacterState.KNOCKDOWN) {
    return {
      ...player,
      position: { ...player.position, y: GAME_CONFIG.GROUND_Y },
      velocity: { x: player.velocity.x, y: 0 },
    };
  }

  if (player.airHitPending && player.hitstun > 0 && isHitState(player.state)) {
    return {
      ...player,
      ...landingReset,
      state: CharacterState.KNOCKDOWN,
      stateFrame: 0,
      position: { ...player.position, y: GAME_CONFIG.GROUND_Y },
      velocity: { x: Math.round(player.velocity.x * 0.6), y: 0 },
      hitstun: 0,
    };
  }

  if (
    player.state === CharacterState.JUMP_FALL
    || player.state === CharacterState.DASH_BACKWARD
    || isJumpAttackState(player.state)
  ) {
    return {
      ...player,
      state: CharacterState.LANDING,
      stateFrame: 0,
      ...landingReset,
    };
  }

  return player;
}

const FULL_COMBO_KNOCKBACK_ATTACKS = new Set<CharacterState>([
  CharacterState.CROUCH_LIGHT_KICK,
  CharacterState.CROUCH_LIGHT_PUNCH,
]);

function canAttackStillConnect(attacker: PlayerState): boolean {
  if (attacker.state === CharacterState.SPECIAL_1) {
    return attacker.attackHitsLanded < GAME_CONFIG.DROPKICK_HIT_COUNT;
  }
  return !attacker.attackHitLanded;
}

function isDropkickHitFrame(
  stateFrame: number,
  startup: number,
  active: number,
  nextHitIndex: number,
): boolean {
  const segmentLength = Math.max(1, Math.floor(active / GAME_CONFIG.DROPKICK_HIT_COUNT));
  const windowStart = startup + nextHitIndex * segmentLength;
  const windowEnd = nextHitIndex === GAME_CONFIG.DROPKICK_HIT_COUNT - 1
    ? startup + active
    : windowStart + segmentLength;
  return stateFrame >= windowStart && stateFrame < windowEnd;
}

function getDropkickDamagePerHit(totalDamage: number): number {
  return Math.ceil(totalDamage / GAME_CONFIG.DROPKICK_HIT_COUNT);
}

function recordAttackConnect(attacker: PlayerState): Pick<PlayerState, 'attackHitLanded' | 'attackHitsLanded'> {
  if (attacker.state === CharacterState.SPECIAL_1) {
    const nextHits = attacker.attackHitsLanded + 1;
    return {
      attackHitsLanded: nextHits,
      attackHitLanded: nextHits >= GAME_CONFIG.DROPKICK_HIT_COUNT,
    };
  }
  return {
    attackHitsLanded: 1,
    attackHitLanded: true,
  };
}

function shouldCheckHitOnFrame(attacker: PlayerState, attackData: { startup: number; active: number }): boolean {
  if (attacker.state === CharacterState.SPECIAL_1) {
    return isDropkickHitFrame(
      attacker.stateFrame,
      attackData.startup,
      attackData.active,
      attacker.attackHitsLanded,
    );
  }

  const hitOnAnyActiveFrame = attacker.state === CharacterState.CROUCH_HEAVY_KICK;
  return hitOnAnyActiveFrame || attacker.stateFrame === attackData.startup;
}

function getHitDamageForAttack(attackerState: CharacterState, attackData: { damage: number }): number {
  if (attackerState === CharacterState.SPECIAL_1) {
    return getDropkickDamagePerHit(attackData.damage);
  }
  return attackData.damage;
}

function getKnockbackForHit(
  knockback: number,
  blocked: boolean,
  isComboHit = false,
  attackerState?: CharacterState,
): { distance: number; velocity: number } {
  const blockScale = blocked ? 0.5 : 1;
  const useComboScale =
    isComboHit &&
    attackerState !== undefined &&
    !FULL_COMBO_KNOCKBACK_ATTACKS.has(attackerState);
  const distanceScale = useComboScale ? GAME_CONFIG.COMBO_KNOCKBACK_DISTANCE_SCALE : 1;
  const velocityScale = useComboScale ? GAME_CONFIG.COMBO_KNOCKBACK_VELOCITY_SCALE : 1;
  return {
    distance: Math.floor(
      knockback * GAME_CONFIG.KNOCKBACK_DISTANCE_SCALE * blockScale * distanceScale,
    ),
    velocity: Math.floor(
      knockback * GAME_CONFIG.KNOCKBACK_VELOCITY_SCALE * blockScale * velocityScale,
    ),
  };
}

function getHitReactionState(
  attackerState: CharacterState,
  hitsLandedBefore = 0,
): CharacterState {
  if (attackerState === CharacterState.CROUCH_HEAVY_KICK) {
    return CharacterState.KNOCKDOWN;
  }
  if (attackerState === CharacterState.SPECIAL_1) {
    const hitNumber = hitsLandedBefore + 1;
    if (hitNumber >= GAME_CONFIG.DROPKICK_HIT_COUNT) {
      return CharacterState.KNOCKDOWN;
    }
    return CharacterState.HIT_STUN_LIGHT;
  }
  if (isLightAttackState(attackerState)) {
    return CharacterState.HIT_STUN_LIGHT;
  }
  if (isHeavyAttackState(attackerState)) {
    return CharacterState.HIT_STUN_HEAVY;
  }
  return CharacterState.HIT_STUN;
}

function isDefenderAirborne(defender: PlayerState): boolean {
  return !defender.isGrounded;
}

function buildAirborneHitDefender(
  defender: PlayerState,
  attacker: PlayerState,
  attackData: { hitstun: number },
  reactionState: CharacterState,
  hitDamage: number,
  knockback: number,
  attackerState: CharacterState,
): PlayerState {
  const pushDir = attacker.facingRight ? 1 : -1;
  const { velocity } = getKnockbackForHit(knockback, false, false, attackerState);

  if (reactionState === CharacterState.KNOCKDOWN) {
    return {
      ...defender,
      health: Math.max(0, defender.health - hitDamage),
      hitstun: 0,
      state: CharacterState.KNOCKDOWN,
      stateFrame: 0,
      isGrounded: false,
      airHitPending: false,
      velocity: {
        x: pushDir * velocity,
        y: Math.max(defender.velocity.y, GAME_CONFIG.AIR_HIT_FALL_VELOCITY),
      },
      airAttackUsed: false,
      airJumpNeutral: false,
      jumpWithForward: false,
      jumpWithBackward: false,
    };
  }

  return {
    ...defender,
    health: Math.max(0, defender.health - hitDamage),
    hitstun: attackData.hitstun,
    state: reactionState,
    stateFrame: 0,
    isGrounded: false,
    airHitPending: true,
    velocity: {
      x: pushDir * velocity,
      y: Math.min(defender.velocity.y, GAME_CONFIG.AIR_HIT_BOUNCE_VELOCITY),
    },
    airAttackUsed: false,
    airJumpNeutral: false,
    jumpWithForward: false,
    jumpWithBackward: false,
  };
}

function clearComboOnRecovery(
  state: GameState,
  prevHitstun: [number, number],
): GameState {
  const comboCounts: [number, number] = [...state.comboCounts];
  const comboDisplayCount: [number, number] = [...state.comboDisplayCount];
  const comboDisplayUntilFrame: [number, number] = [...state.comboDisplayUntilFrame];

  for (let defenderIdx = 0; defenderIdx < 2; defenderIdx++) {
    if (prevHitstun[defenderIdx] <= 0) continue;

    const defender = state.players[defenderIdx];
    const recovered =
      defender.hitstun === 0 && !isHitState(defender.state);

    if (recovered) {
      const attackerIdx = 1 - defenderIdx;
      const finalCombo = comboCounts[attackerIdx];
      if (finalCombo >= 2) {
        comboDisplayCount[attackerIdx] = finalCombo;
        comboDisplayUntilFrame[attackerIdx] =
          state.frameNumber + GAME_CONFIG.COMBO_DISPLAY_FRAMES;
      }
      comboCounts[attackerIdx] = 0;
    }
  }

  return {
    ...state,
    comboCounts,
    comboDisplayCount,
    comboDisplayUntilFrame,
  };
}

function processHits(state: GameState): GameState {
  const newState: GameState = {
    ...state,
    comboCounts: [...state.comboCounts] as [number, number],
    players: [
      { ...state.players[0] },
      { ...state.players[1] },
    ],
  };
  
  for (let attackerIdx = 0; attackerIdx < 2; attackerIdx++) {
    const defenderIdx = 1 - attackerIdx;
    const attacker = newState.players[attackerIdx];
    const defender = newState.players[defenderIdx];

    if (!isAttackingState(attacker.state)) continue;
    if (!canAttackStillConnect(attacker)) continue;

    const attackData = ATTACK_DATA[attacker.state];
    if (!attackData) continue;

    const isInActiveFrames = 
      attacker.stateFrame >= attackData.startup && 
      attacker.stateFrame < attackData.startup + attackData.active;

    if (!isInActiveFrames) continue;

    if (!shouldCheckHitOnFrame(attacker, attackData)) continue;

    const hitbox = getHitbox(
      BASE_CHARACTER,
      attacker.state,
      attacker.stateFrame,
      attacker.facingRight,
      attacker.position,
    );
    if (!hitbox) continue;

    const hurtbox = getHurtbox(BASE_CHARACTER, defender.state, defender.position);
    if (!hurtbox) continue;
    if (isDefenderInvulnerable(defender)) continue;
    if (!boxesOverlap(hitbox, hurtbox)) continue;

    const stateData = getStateData(BASE_CHARACTER, attacker.state);
    const knockback = stateData?.frameData?.knockback ?? 200;
    const pushDir = attacker.facingRight ? 1 : -1;
    const hitDamage = getHitDamageForAttack(attacker.state, attackData);
    const connectState = recordAttackConnect(attacker);
    const endMultiHitState =
      attacker.state === CharacterState.SPECIAL_1
        ? {
            attackHitsLanded: GAME_CONFIG.DROPKICK_HIT_COUNT,
            attackHitLanded: true,
          }
        : connectState;

    {
      const attackOverhead =
        stateData?.frameData?.isOverhead ?? isJumpAttackState(attacker.state);
      const attackLow = stateData?.frameData?.isLow ?? false;
      const blocked = canGuardBlockAttack(defender, attackOverhead, attackLow);
      const blockStance = resolveDefenderBlockStance(defender);
      const isCrouchBlock = blockStance === 'crouch';

      const isAirAttack = isJumpAttackState(attacker.state);
      const defenderAirborne = isDefenderAirborne(defender);

      if (blocked) {
        newState.comboCounts[attackerIdx] = 0;
        newState.comboDisplayCount = [...state.comboDisplayCount] as [number, number];
        newState.comboDisplayUntilFrame = [...state.comboDisplayUntilFrame] as [number, number];
        newState.comboDisplayCount[attackerIdx] = 0;
        newState.comboDisplayUntilFrame[attackerIdx] = 0;
        if (defenderAirborne) {
          newState.players[attackerIdx] = {
            ...attacker,
            ...endMultiHitState,
          };
          newState.players[defenderIdx] = {
            ...defender,
            blockstun: attackData.blockstun,
            state: CharacterState.STAND_GUARD,
            stateFrame: 0,
            isGrounded: false,
          };
        } else if (isAirAttack) {
          newState.players[attackerIdx] = {
            ...attacker,
            ...endMultiHitState,
          };
          newState.players[defenderIdx] = {
            ...defender,
            blockstun: attackData.blockstun,
            state: isCrouchBlock ? CharacterState.CROUCH_GUARD : CharacterState.STAND_GUARD,
            stateFrame: 0,
          };
        } else {
          const { distance, velocity } = getKnockbackForHit(knockback, true);
          const [pushedAttacker, pushedDefender] = applyKnockbackWithCornerPush(
            attacker,
            defender,
            distance,
            velocity,
          );
          newState.players[attackerIdx] = {
            ...pushedAttacker,
            ...endMultiHitState,
          };
          newState.players[defenderIdx] = {
            ...pushedDefender,
            blockstun: attackData.blockstun,
            state: isCrouchBlock ? CharacterState.CROUCH_GUARD : CharacterState.STAND_GUARD,
            stateFrame: 0,
            velocity: { x: pushDir * velocity, y: pushedDefender.velocity.y },
          };
        }
        newState.hitstopRemaining = Math.max(
          newState.hitstopRemaining,
          getHitstopFrames(attacker.state, true),
        );
      } else {
        const defenderInHurt = defender.hitstun > 0 || isHitState(defender.state);
        if (defenderInHurt) {
          newState.comboCounts[attackerIdx] += 1;
        } else {
          newState.comboCounts[attackerIdx] = 1;
        }

        const reactionState = getHitReactionState(attacker.state, attacker.attackHitsLanded);

        if (defenderAirborne) {
          newState.players[attackerIdx] = {
            ...attacker,
            ...connectState,
          };
          newState.players[defenderIdx] = buildAirborneHitDefender(
            defender,
            attacker,
            attackData,
            reactionState,
            hitDamage,
            knockback,
            attacker.state,
          );
          newState.hitstopRemaining = Math.max(
            newState.hitstopRemaining,
            getHitstopFrames(attacker.state, false),
          );
        } else if (isAirAttack) {
          newState.players[attackerIdx] = {
            ...attacker,
            ...connectState,
          };
          newState.players[defenderIdx] = {
            ...defender,
            health: Math.max(0, defender.health - hitDamage),
            hitstun: reactionState === CharacterState.KNOCKDOWN ? 0 : attackData.hitstun,
            state: reactionState,
            stateFrame: 0,
            isGrounded: true,
            position: { ...defender.position, y: GAME_CONFIG.GROUND_Y },
          };
          newState.hitstopRemaining = Math.max(
            newState.hitstopRemaining,
            getHitstopFrames(attacker.state, false),
          );
        } else {
          const knockdown = reactionState === CharacterState.KNOCKDOWN;
          const isDropkickFinisher =
            knockdown
            && attacker.state === CharacterState.SPECIAL_1
            && attacker.attackHitsLanded + 1 >= GAME_CONFIG.DROPKICK_HIT_COUNT;

          newState.players[attackerIdx] = {
            ...attacker,
            ...connectState,
          };

          if (knockdown) {
            if (isDropkickFinisher) {
              const { distance, velocity } = getKnockbackForHit(
                GAME_CONFIG.DROPKICK_FINISHER_KNOCKBACK,
                false,
                false,
                attacker.state,
              );
              const [pushedAttacker, pushedDefender] = applyKnockbackWithCornerPush(
                attacker,
                defender,
                distance,
                velocity,
              );
              newState.players[attackerIdx] = {
                ...pushedAttacker,
                ...connectState,
              };
              newState.players[defenderIdx] = {
                ...pushedDefender,
                health: Math.max(0, defender.health - hitDamage),
                hitstun: 0,
                state: CharacterState.KNOCKDOWN,
                stateFrame: 0,
                isGrounded: true,
                position: { ...pushedDefender.position, y: GAME_CONFIG.GROUND_Y },
                velocity: { x: pushDir * velocity, y: 0 },
              };
            } else {
              newState.players[defenderIdx] = {
                ...defender,
                health: Math.max(0, defender.health - hitDamage),
                hitstun: 0,
                state: CharacterState.KNOCKDOWN,
                stateFrame: 0,
                isGrounded: true,
                position: { ...defender.position, y: GAME_CONFIG.GROUND_Y },
                velocity: { x: 0, y: 0 },
              };
            }
          } else {
            const { distance, velocity } = getKnockbackForHit(
              knockback,
              false,
              defenderInHurt,
              attacker.state,
            );
            const [pushedAttacker, pushedDefender] = applyKnockbackWithCornerPush(
              attacker,
              defender,
              distance,
              velocity,
            );
            newState.players[attackerIdx] = {
              ...pushedAttacker,
              ...connectState,
            };
            newState.players[defenderIdx] = {
              ...pushedDefender,
              health: Math.max(0, defender.health - hitDamage),
              hitstun: attackData.hitstun,
              state: reactionState,
              stateFrame: 0,
              isGrounded: true,
              position: { ...pushedDefender.position, y: GAME_CONFIG.GROUND_Y },
              velocity: { x: pushDir * velocity, y: defender.velocity.y },
            };
          }

          if (!knockdown || isDropkickFinisher) {
            newState.hitstopRemaining = Math.max(
              newState.hitstopRemaining,
              getHitstopFrames(attacker.state, false),
            );
          }
        }
      }
    }
  }

  return newState;
}

function updateRoundTimer(state: GameState): GameState {
  if (state.roundTimer > 0) {
    state.roundTimer--;
  }
  return state;
}

function checkRoundEnd(state: GameState): GameState {
  const [p1, p2] = state.players;

  if (p1.health <= 0 || p2.health <= 0 || state.roundTimer <= 0) {
    state.isRoundOver = true;
    state.roundEndTimer = 0;

    if (p1.health <= 0 && p2.health <= 0) {
      state.winner = null;
    } else if (p1.health <= 0) {
      state.winner = 1;
      state.roundWins[1]++;
    } else if (p2.health <= 0) {
      state.winner = 0;
      state.roundWins[0]++;
    } else if (p1.health > p2.health) {
      state.winner = 0;
      state.roundWins[0]++;
    } else if (p2.health > p1.health) {
      state.winner = 1;
      state.roundWins[1]++;
    } else {
      state.winner = null;
    }

    if (state.winner === null) {
      state.roundWins[0]++;
      state.roundWins[1]++;
    }

    state.isMatchOver =
      state.roundWins[0] >= GAME_CONFIG.ROUNDS_TO_WIN ||
      state.roundWins[1] >= GAME_CONFIG.ROUNDS_TO_WIN;
  }

  return state;
}

function updateRoundIntro(state: GameState): GameState {
  const newState = cloneGameState(state);
  newState.frameNumber++;
  newState.roundIntroTimer++;
  return newState;
}

function updateAfterRoundEnd(state: GameState): GameState {
  const newState = cloneGameState(state);
  newState.frameNumber++;
  newState.roundEndTimer++;

  if (newState.roundEndTimer < GAME_CONFIG.ROUND_END_DELAY_FRAMES) {
    return newState;
  }

  if (newState.isMatchOver) {
    return newState;
  }

  return startNextRound(newState);
}

function startNextRound(state: GameState): GameState {
  const newState = cloneGameState(state);
  newState.roundNumber++;
  newState.roundTimer = GAME_CONFIG.ROUND_TIME;
  newState.isRoundOver = false;
  newState.winner = null;
  newState.roundEndTimer = 0;
  newState.roundIntroTimer = 0;
  newState.projectiles = [];
  newState.comboCounts = [0, 0];
  newState.comboDisplayCount = [0, 0];
  newState.comboDisplayUntilFrame = [0, 0];
  newState.hitstopRemaining = 0;
  newState.players = [createInitialPlayerState(0), createInitialPlayerState(1)];
  return newState;
}

export function createProjectile(
  owner: number,
  position: { x: number; y: number },
  velocity: { x: number; y: number },
  nextProjectileId: number
): Projectile {
  return {
    id: nextProjectileId,
    owner,
    position: { ...position },
    velocity: { ...velocity },
    active: true,
    hitbox: { x: -1500, y: -1500, width: 3000, height: 3000 },
    damage: 60,
    lifetime: 180,
  };
}
