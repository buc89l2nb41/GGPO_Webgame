/**
 * Character Entity - Represents a playable character in the game
 */

import { 
  PlayerState, 
  CharacterState, 
  InputState, 
  createInitialPlayerState,
} from '../engine/GameState';
import { BASE_CHARACTER, CharacterData, getStateData } from '../data/characters/BaseCharacter';
import { wasJustPressed } from '../systems/InputSystem';
import { isCrouchingState, isAirborneState } from '../systems/PhysicsSystem';

export class Character {
  private data: CharacterData;
  
  constructor(data: CharacterData = BASE_CHARACTER) {
    this.data = data;
  }
  
  getData(): CharacterData {
    return this.data;
  }
  
  createInitialState(playerIndex: number): PlayerState {
    return createInitialPlayerState(playerIndex);
  }
  
  update(player: PlayerState, opponentPosition: { x: number; y: number }): PlayerState {
    const newPlayer = { ...player };
    const justPressed = wasJustPressed(player.input, player.previousInput);
    
    if (newPlayer.hitstun > 0) {
      newPlayer.hitstun--;
      if (newPlayer.hitstun === 0 && newPlayer.state === CharacterState.HIT_STUN) {
        newPlayer.state = newPlayer.isGrounded ? CharacterState.IDLE : CharacterState.JUMP_FALL;
        newPlayer.stateFrame = 0;
      }
      newPlayer.stateFrame++;
      return newPlayer;
    }
    
    if (newPlayer.blockstun > 0) {
      newPlayer.blockstun--;
      if (newPlayer.blockstun === 0) {
        newPlayer.state = isCrouchingState(newPlayer.state) 
          ? CharacterState.CROUCH 
          : CharacterState.IDLE;
        newPlayer.stateFrame = 0;
      }
      newPlayer.stateFrame++;
      return newPlayer;
    }
    
    const stateData = getStateData(this.data, newPlayer.state);
    
    if (stateData && stateData.duration > 0 && newPlayer.stateFrame >= stateData.duration) {
      newPlayer.state = this.getNextState(newPlayer);
      newPlayer.stateFrame = 0;
    }
    
    newPlayer.stateFrame++;
    
    switch (newPlayer.state) {
      case CharacterState.IDLE:
      case CharacterState.WALK_FORWARD:
      case CharacterState.WALK_BACKWARD:
        return this.handleGroundedState(newPlayer, justPressed, opponentPosition);
        
      case CharacterState.CROUCH:
        return this.handleCrouchState(newPlayer, justPressed, opponentPosition);
        
      case CharacterState.JUMP_START:
        return this.handleJumpStart(newPlayer);
        
      case CharacterState.JUMP_UP:
      case CharacterState.JUMP_FORWARD:
      case CharacterState.JUMP_BACKWARD:
      case CharacterState.JUMP_FALL:
        return this.handleAirborneState(newPlayer);
        
      case CharacterState.LANDING:
        return this.handleLanding(newPlayer);
        
      case CharacterState.STAND_GUARD:
      case CharacterState.CROUCH_GUARD:
        return this.handleGuardState(newPlayer, opponentPosition);
        
      case CharacterState.KNOCKDOWN:
        return this.handleKnockdown(newPlayer);
        
      case CharacterState.GET_UP:
        return this.handleGetUp(newPlayer);
        
      default:
        return newPlayer;
    }
  }
  
  private getNextState(player: PlayerState): CharacterState {
    if (isCrouchingState(player.state)) {
      return player.input.down ? CharacterState.CROUCH : CharacterState.IDLE;
    }
    
    if (isAirborneState(player.state)) {
      if (player.isGrounded) {
        return CharacterState.LANDING;
      }
      return player.velocity.y > 0 ? CharacterState.JUMP_FALL : player.state;
    }
    
    if (player.state === CharacterState.LANDING) {
      return CharacterState.IDLE;
    }
    
    if (player.state === CharacterState.KNOCKDOWN) {
      return CharacterState.GET_UP;
    }
    
    if (player.state === CharacterState.GET_UP) {
      return CharacterState.IDLE;
    }
    
    return CharacterState.IDLE;
  }
  
  private handleGroundedState(
    player: PlayerState, 
    justPressed: InputState,
    opponentPosition: { x: number; y: number }
  ): PlayerState {
    player.velocity.x = 0;
    
    if (justPressed.up) {
      player.state = CharacterState.JUMP_START;
      player.stateFrame = 0;
      return player;
    }
    
    if (player.input.down) {
      player.state = CharacterState.CROUCH;
      player.stateFrame = 0;
      return player;
    }
    
    if (this.tryAttack(player, justPressed, false)) {
      return player;
    }
    
    if (this.checkGuardInput(player, opponentPosition)) {
      player.state = CharacterState.STAND_GUARD;
      player.stateFrame = 0;
      return player;
    }
    
    if (player.input.right) {
      player.velocity.x = player.facingRight 
        ? this.data.walkSpeed 
        : -this.data.backwalkSpeed;
      player.state = player.facingRight 
        ? CharacterState.WALK_FORWARD 
        : CharacterState.WALK_BACKWARD;
    } else if (player.input.left) {
      player.velocity.x = player.facingRight 
        ? -this.data.backwalkSpeed 
        : this.data.walkSpeed;
      player.state = player.facingRight 
        ? CharacterState.WALK_BACKWARD 
        : CharacterState.WALK_FORWARD;
    } else {
      player.state = CharacterState.IDLE;
    }
    
    return player;
  }
  
  private handleCrouchState(
    player: PlayerState, 
    justPressed: InputState,
    opponentPosition: { x: number; y: number }
  ): PlayerState {
    player.velocity.x = 0;
    
    if (!player.input.down) {
      player.state = CharacterState.IDLE;
      player.stateFrame = 0;
      return player;
    }
    
    if (this.tryAttack(player, justPressed, true)) {
      return player;
    }
    
    if (this.checkGuardInput(player, opponentPosition)) {
      player.state = CharacterState.CROUCH_GUARD;
      player.stateFrame = 0;
      return player;
    }
    
    return player;
  }
  
  private handleJumpStart(player: PlayerState): PlayerState {
    if (player.stateFrame >= 4) {
      player.velocity.y = -this.data.jumpForce;
      player.isGrounded = false;
      
      if (player.input.right) {
        player.velocity.x = player.facingRight 
          ? this.data.jumpForwardSpeed 
          : -this.data.jumpBackwardSpeed;
        player.state = player.facingRight 
          ? CharacterState.JUMP_FORWARD 
          : CharacterState.JUMP_BACKWARD;
      } else if (player.input.left) {
        player.velocity.x = player.facingRight 
          ? -this.data.jumpBackwardSpeed 
          : this.data.jumpForwardSpeed;
        player.state = player.facingRight 
          ? CharacterState.JUMP_BACKWARD 
          : CharacterState.JUMP_FORWARD;
      } else {
        player.state = CharacterState.JUMP_UP;
      }
      player.stateFrame = 0;
    }
    
    return player;
  }
  
  private handleAirborneState(player: PlayerState): PlayerState {
    if (player.velocity.y > 0 && player.state !== CharacterState.JUMP_FALL) {
      player.state = CharacterState.JUMP_FALL;
      player.stateFrame = 0;
    }
    
    if (player.isGrounded) {
      player.state = CharacterState.LANDING;
      player.stateFrame = 0;
      player.velocity.x = 0;
    }
    
    return player;
  }
  
  private handleLanding(player: PlayerState): PlayerState {
    player.velocity.x = 0;
    
    if (player.stateFrame >= 4) {
      player.state = CharacterState.IDLE;
      player.stateFrame = 0;
    }
    
    return player;
  }
  
  private handleGuardState(
    player: PlayerState,
    opponentPosition: { x: number; y: number }
  ): PlayerState {
    if (!this.checkGuardInput(player, opponentPosition)) {
      player.state = player.input.down ? CharacterState.CROUCH : CharacterState.IDLE;
      player.stateFrame = 0;
    }
    
    return player;
  }
  
  private handleKnockdown(player: PlayerState): PlayerState {
    if (player.stateFrame >= 50) {
      player.state = CharacterState.GET_UP;
      player.stateFrame = 0;
    }
    
    return player;
  }
  
  private handleGetUp(player: PlayerState): PlayerState {
    if (player.stateFrame >= 25) {
      player.state = CharacterState.IDLE;
      player.stateFrame = 0;
    }
    
    return player;
  }
  
  private tryAttack(player: PlayerState, justPressed: InputState, isCrouching: boolean): boolean {
    if (justPressed.lightPunch) {
      player.state = isCrouching 
        ? CharacterState.CROUCH_LIGHT_PUNCH 
        : CharacterState.STAND_LIGHT_PUNCH;
      player.stateFrame = 0;
      return true;
    }
    
    if (justPressed.heavyPunch) {
      player.state = isCrouching 
        ? CharacterState.CROUCH_HEAVY_PUNCH 
        : CharacterState.STAND_HEAVY_PUNCH;
      player.stateFrame = 0;
      return true;
    }
    
    if (justPressed.lightKick) {
      player.state = isCrouching 
        ? CharacterState.CROUCH_LIGHT_KICK 
        : CharacterState.STAND_LIGHT_KICK;
      player.stateFrame = 0;
      return true;
    }
    
    if (justPressed.heavyKick) {
      player.state = isCrouching 
        ? CharacterState.CROUCH_HEAVY_KICK 
        : CharacterState.STAND_HEAVY_KICK;
      player.stateFrame = 0;
      return true;
    }
    
    return false;
  }
  
  private checkGuardInput(
    player: PlayerState, 
    _opponentPosition: { x: number; y: number }
  ): boolean {
    const holdingBack = player.facingRight 
      ? player.input.left 
      : player.input.right;
    
    return holdingBack;
  }
}

export const defaultCharacter = new Character(BASE_CHARACTER);
