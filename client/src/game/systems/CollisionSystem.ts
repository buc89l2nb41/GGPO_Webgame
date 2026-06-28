/**
 * Collision System - Handles hitbox/hurtbox collision detection
 */

import { GameState, PlayerState, Box, CharacterState } from '../engine/GameState';
import { BASE_CHARACTER, getHitbox, getHurtbox, getStateData } from '../data/characters/BaseCharacter';
import {
  boxesOverlap,
  isAttackingState,
  isCrouchingState,
  canGuardBlockAttack,
} from './PhysicsSystem';

export interface HitResult {
  attacker: number;
  defender: number;
  damage: number;
  hitstun: number;
  blockstun: number;
  knockback: number;
  blocked: boolean;
  isLow: boolean;
  isOverhead: boolean;
}

export function checkCollisions(state: GameState): HitResult[] {
  const results: HitResult[] = [];
  
  for (let attackerIdx = 0; attackerIdx < 2; attackerIdx++) {
    const defenderIdx = 1 - attackerIdx;
    const attacker = state.players[attackerIdx];
    const defender = state.players[defenderIdx];
    
    if (!isAttackingState(attacker.state)) continue;
    
    const stateData = getStateData(BASE_CHARACTER, attacker.state);
    if (!stateData?.frameData) continue;
    
    const hitbox = getHitbox(
      BASE_CHARACTER,
      attacker.state,
      attacker.stateFrame,
      attacker.facingRight,
      attacker.position
    );
    
    if (!hitbox) continue;
    
    if (attacker.stateFrame !== stateData.frameData.startup) continue;
    
    const hurtbox = getHurtbox(BASE_CHARACTER, defender.state, defender.position);
    
    if (boxesOverlap(hitbox, hurtbox)) {
      const frameData = stateData.frameData;
      const blocked = checkBlock(defender, attacker, frameData.isLow, frameData.isOverhead);
      
      results.push({
        attacker: attackerIdx,
        defender: defenderIdx,
        damage: frameData.damage,
        hitstun: frameData.hitstun,
        blockstun: frameData.blockstun,
        knockback: frameData.knockback,
        blocked,
        isLow: frameData.isLow,
        isOverhead: frameData.isOverhead,
      });
    }
  }
  
  return results;
}

function checkBlock(defender: PlayerState, _attacker: PlayerState, isLow: boolean, isOverhead: boolean): boolean {
  return canGuardBlockAttack(defender, isOverhead, isLow);
}

export function applyHitResults(state: GameState, results: HitResult[]): GameState {
  const newState = { ...state };
  newState.players = [...state.players] as [PlayerState, PlayerState];
  
  for (const result of results) {
    const defender = { ...newState.players[result.defender] };
    const attacker = newState.players[result.attacker];
    
    if (result.blocked) {
      defender.blockstun = result.blockstun;
      defender.state = isCrouchingState(defender.state) 
        ? CharacterState.CROUCH_GUARD 
        : CharacterState.STAND_GUARD;
      defender.stateFrame = 0;
      
      const pushback = Math.floor(result.knockback * 0.5);
      defender.velocity.x = attacker.facingRight ? pushback : -pushback;
    } else {
      defender.health = Math.max(0, defender.health - result.damage);
      defender.hitstun = result.hitstun;
      defender.state = CharacterState.HIT_STUN;
      defender.stateFrame = 0;
      
      defender.velocity.x = attacker.facingRight ? result.knockback : -result.knockback;
      
      if (result.isLow && isCrouchingState(attacker.state)) {
        defender.state = CharacterState.KNOCKDOWN;
        defender.velocity.y = -500;
      }
    }
    
    newState.players[result.defender] = defender;
  }
  
  return newState;
}

export function getActiveHitboxes(state: GameState): Array<{ playerIndex: number; box: Box }> {
  const hitboxes: Array<{ playerIndex: number; box: Box }> = [];
  
  for (let i = 0; i < 2; i++) {
    const player = state.players[i];
    const hitbox = getHitbox(
      BASE_CHARACTER,
      player.state,
      player.stateFrame,
      player.facingRight,
      player.position
    );
    
    if (hitbox) {
      hitboxes.push({ playerIndex: i, box: hitbox });
    }
  }
  
  return hitboxes;
}

export function getActiveHurtboxes(state: GameState): Array<{ playerIndex: number; box: Box }> {
  return state.players.map((player, index) => ({
    playerIndex: index,
    box: getHurtbox(BASE_CHARACTER, player.state, player.position),
  }));
}
