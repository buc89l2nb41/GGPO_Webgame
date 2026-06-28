/**
 * Canvas Renderer for the fighting game
 * Renders game state to HTML5 Canvas
 */

import { GameState, PlayerState, GAME_CONFIG, CharacterState, getRoundIntroPhase, getMatchResult, isRoundIntroActive } from './GameState';
import { SpriteData, getAnimationFrame } from './SpriteSystem';
import { BASE_CHARACTER, getHitbox, getHurtbox, getPushbox } from '../data/characters/BaseCharacter';
import { getCameraX } from '../systems/PhysicsSystem';
import {
  applyEditorPreview,
  HitboxEditorPreview,
} from '../editor/hitboxEditorPreview';

export interface RendererConfig {
  canvasWidth: number;
  canvasHeight: number;
  showHitboxes: boolean;
  showDebugInfo: boolean;
}

const DEFAULT_RENDERER_CONFIG: RendererConfig = {
  canvasWidth: 1280,
  canvasHeight: 720,
  showHitboxes: false,
  showDebugInfo: false,
};

/** Jump states that share the same animation sequence */
const JUMP_STATES = new Set([
  CharacterState.JUMP_START,
  CharacterState.JUMP_UP,
  CharacterState.JUMP_FORWARD,
  CharacterState.JUMP_BACKWARD,
  CharacterState.JUMP_FALL,
  CharacterState.JUMP_LIGHT_PUNCH,
  CharacterState.JUMP_HEAVY_PUNCH,
  CharacterState.JUMP_LIGHT_KICK,
  CharacterState.JUMP_HEAVY_KICK,
  CharacterState.LANDING,
  CharacterState.DASH_BACKWARD,
]);

/** Walk / dash states that share looped ground-move animation timing */
const GROUND_MOVE_STATES = new Set([
  CharacterState.WALK_FORWARD,
  CharacterState.WALK_BACKWARD,
  CharacterState.DASH_FORWARD,
]);

/** Crouch states that share the crouch animation */
const CROUCH_STATES = new Set([
  CharacterState.CROUCH,
  CharacterState.CROUCH_GUARD,
  CharacterState.CROUCH_LIGHT_PUNCH,
  CharacterState.CROUCH_HEAVY_PUNCH,
  CharacterState.CROUCH_LIGHT_KICK,
  CharacterState.CROUCH_HEAVY_KICK,
]);

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: RendererConfig;
  private scaleX: number;
  private scaleY: number;
  private spriteData: SpriteData | null = null;
  private animationCounters: [number, number] = [0, 0];
  /** Separate jump animation counters to track entire jump sequence */
  private jumpAnimCounters: [number, number] = [0, 0];
  /** Track if player was jumping last frame */
  private wasJumping: [boolean, boolean] = [false, false];
  /** Separate crouch animation counters */
  private crouchAnimCounters: [number, number] = [0, 0];
  private wasCrouching: [boolean, boolean] = [false, false];
  /** Separate walk animation counters */
  private walkAnimCounters: [number, number] = [0, 0];
  private wasWalking: [boolean, boolean] = [false, false];
  /** Camera X position (left edge of viewport in game units) */
  private cameraX: number = 0;
  private editorPreview: HitboxEditorPreview | null = null;

  constructor(canvas: HTMLCanvasElement, config: Partial<RendererConfig> = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }
    this.ctx = ctx;
    this.config = { ...DEFAULT_RENDERER_CONFIG, ...config };
    
    this.canvas.width = this.config.canvasWidth;
    this.canvas.height = this.config.canvasHeight;
    
    // Scale based on viewport (visible area), not full stage
    this.scaleX = this.config.canvasWidth / GAME_CONFIG.VIEWPORT_WIDTH;
    this.scaleY = this.config.canvasHeight / GAME_CONFIG.VIEWPORT_HEIGHT;
    
    this.ctx.imageSmoothingEnabled = false;
  }

  setConfig(config: Partial<RendererConfig>): void {
    this.config = { ...this.config, ...config };
  }

  setSpriteData(data: SpriteData): void {
    this.spriteData = data;
  }

  /** Convert game X coordinate to screen X (accounting for camera) */
  private toScreenX(gameX: number): number {
    return (gameX - this.cameraX) * this.scaleX;
  }

  private toScreenY(gameY: number): number {
    return gameY * this.scaleY;
  }

  /** Convert game width to screen width (no camera offset) */
  private toScreenWidth(gameWidth: number): number {
    return gameWidth * this.scaleX;
  }

  /** Convert game height to screen height (no camera offset) */
  private toScreenHeight(gameHeight: number): number {
    return gameHeight * this.scaleY;
  }

  getCameraX(): number {
    return this.cameraX;
  }

  getRenderScale(): { scaleX: number; scaleY: number } {
    return { scaleX: this.scaleX, scaleY: this.scaleY };
  }

  setEditorPreview(preview: HitboxEditorPreview | null): void {
    this.editorPreview = preview;
  }

  /** Update camera to follow players */
  private updateCamera(state: GameState): void {
    const p1 = state.players[0];
    const p2 = state.players[1];
    this.cameraX = getCameraX(p1.position.x, p2.position.x);
  }

  render(state: GameState): void {
    const renderState = this.editorPreview
      ? applyEditorPreview(state, this.editorPreview)
      : state;

    this.updateCamera(renderState);
    this.clear();
    this.renderBackground();
    this.renderStage();
    this.renderPlayers(renderState);
    this.renderProjectiles(renderState);

    if (this.config.showHitboxes) {
      this.renderAllHitboxes(renderState);
    }

    this.renderHUD(renderState);

    if (this.config.showDebugInfo) {
      this.renderDebugInfo(renderState);
    }
  }

  private clear(): void {
    this.ctx.fillStyle = '#1a1a2e';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private renderBackground(): void {
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    gradient.addColorStop(0, '#0f0f23');
    gradient.addColorStop(0.6, '#1a1a2e');
    gradient.addColorStop(1, '#16213e');
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private renderStage(): void {
    const groundY = this.toScreenY(GAME_CONFIG.GROUND_Y);
    
    // Ground
    this.ctx.fillStyle = '#2d2d44';
    this.ctx.fillRect(0, groundY, this.canvas.width, this.canvas.height - groundY);
    
    // Ground line
    this.ctx.strokeStyle = '#4a4a6a';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(0, groundY);
    this.ctx.lineTo(this.canvas.width, groundY);
    this.ctx.stroke();
    
    // Position markers on ground (every 1/10 of viewport width)
    const markerInterval = GAME_CONFIG.VIEWPORT_WIDTH / 10;
    const startMarker = Math.floor(this.cameraX / markerInterval) * markerInterval;
    const endMarker = this.cameraX + GAME_CONFIG.VIEWPORT_WIDTH + markerInterval;
    
    this.ctx.font = '12px monospace';
    this.ctx.textAlign = 'center';
    
    for (let gameX = startMarker; gameX <= endMarker; gameX += markerInterval) {
      const screenX = this.toScreenX(gameX);
      if (screenX < -50 || screenX > this.canvas.width + 50) continue;
      
      // Marker line
      const isMajor = gameX % (markerInterval * 5) === 0; // Every half viewport
      this.ctx.strokeStyle = isMajor ? '#6a6a8a' : '#4a4a6a';
      this.ctx.lineWidth = isMajor ? 3 : 1;
      this.ctx.beginPath();
      this.ctx.moveTo(screenX, groundY);
      this.ctx.lineTo(screenX, groundY + (isMajor ? 20 : 10));
      this.ctx.stroke();
      
      // Position label (for major markers)
      if (isMajor) {
        const percent = Math.round((gameX / GAME_CONFIG.STAGE_WIDTH) * 100);
        this.ctx.fillStyle = '#8a8aaa';
        this.ctx.fillText(`${percent}%`, screenX, groundY + 35);
      }
    }
    
    // Stage center marker
    const centerX = this.toScreenX(GAME_CONFIG.STAGE_WIDTH / 2);
    if (centerX > 0 && centerX < this.canvas.width) {
      this.ctx.strokeStyle = '#ffaa44';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(centerX, groundY);
      this.ctx.lineTo(centerX, groundY + 25);
      this.ctx.stroke();
      this.ctx.fillStyle = '#ffaa44';
      this.ctx.fillText('CENTER', centerX, groundY + 40);
    }
    
    // Stage boundaries (walls) - visible when camera is near edges
    const leftWallX = this.toScreenX(0);
    const rightWallX = this.toScreenX(GAME_CONFIG.STAGE_WIDTH);
    
    this.ctx.lineWidth = 4;
    
    // Left wall (visible when camera is at left edge)
    if (leftWallX > -10) {
      this.ctx.strokeStyle = '#ff6666';
      this.ctx.beginPath();
      this.ctx.moveTo(leftWallX, 0);
      this.ctx.lineTo(leftWallX, this.canvas.height);
      this.ctx.stroke();
      this.ctx.fillStyle = '#ff6666';
      this.ctx.textAlign = 'left';
      this.ctx.fillText('LEFT WALL', leftWallX + 5, 20);
    }
    
    // Right wall (visible when camera is at right edge)
    if (rightWallX < this.canvas.width + 10) {
      this.ctx.strokeStyle = '#ff6666';
      this.ctx.beginPath();
      this.ctx.moveTo(rightWallX, 0);
      this.ctx.lineTo(rightWallX, this.canvas.height);
      this.ctx.stroke();
      this.ctx.fillStyle = '#ff6666';
      this.ctx.textAlign = 'right';
      this.ctx.fillText('RIGHT WALL', rightWallX - 5, 20);
    }
  }

  private renderPlayers(state: GameState): void {
    state.players.forEach((player, index) => {
      this.renderPlayer(player, index, state);
    });
  }

  private renderPlayer(player: PlayerState, index: number, _state: GameState): void {
    const x = this.toScreenX(player.position.x);
    const y = this.toScreenY(player.position.y);
    
    this.animationCounters[index]++;
    
    // Track jump animation separately for continuous playback
    const isJumping = JUMP_STATES.has(player.state);
    if (isJumping) {
      if (!this.wasJumping[index]) {
        // Just started jumping - reset jump counter
        this.jumpAnimCounters[index] = 0;
      }
      this.jumpAnimCounters[index]++;
    }
    this.wasJumping[index] = isJumping;

    const isCrouching = CROUCH_STATES.has(player.state);
    if (isCrouching) {
      if (!this.wasCrouching[index]) {
        this.crouchAnimCounters[index] = 0;
      }
      this.crouchAnimCounters[index]++;
    }
    this.wasCrouching[index] = isCrouching;

    const isWalking = GROUND_MOVE_STATES.has(player.state);
    if (isWalking) {
      if (!this.wasWalking[index]) {
        this.walkAnimCounters[index] = 0;
      }
      this.walkAnimCounters[index]++;
    }
    this.wasWalking[index] = isWalking;
    
    if (this.spriteData) {
      const editorDriven = this.editorPreview?.playerIndex === index;
      const useStateFrame = editorDriven
        || this.isAttackingState(player.state)
        || player.state === CharacterState.HIT_STUN_LIGHT
        || player.state === CharacterState.HIT_STUN_HEAVY
        || player.state === CharacterState.KNOCKDOWN
        || player.state === CharacterState.GET_UP
        || player.state === CharacterState.LANDING;
      const animCounter = useStateFrame
        ? player.stateFrame
        : isJumping
          ? this.jumpAnimCounters[index]
          : isCrouching
            ? this.crouchAnimCounters[index]
            : isWalking
              ? this.walkAnimCounters[index]
              : this.animationCounters[index];
      const frame = getAnimationFrame(this.spriteData, player.state, animCounter, player);
      if (frame) {
        this.ctx.save();
        this.ctx.translate(x, y);
        
        if (!player.facingRight) {
          this.ctx.scale(-1, 1);
        }
        
        const targetHeight = this.toScreenHeight(GAME_CONFIG.SPRITE_TARGET_HEIGHT);
        const scale = targetHeight / frame.height;
        const drawWidth = frame.width * scale;
        const drawHeight = frame.height * scale;
        
        this.ctx.drawImage(
          frame.image,
          -drawWidth / 2,
          -drawHeight,
          drawWidth,
          drawHeight
        );
        
        this.ctx.restore();
        return;
      }
    }
    
    const baseColor = index === 0 ? '#4ecdc4' : '#ff6b6b';
    const darkColor = index === 0 ? '#26a69a' : '#c94c4c';
    
    const width = this.toScreenWidth(GAME_CONFIG.PUSH_BOX_WIDTH);
    const height = this.toScreenHeight(GAME_CONFIG.PUSH_BOX_HEIGHT);
    
    this.ctx.save();
    this.ctx.translate(x, y);
    
    if (!player.facingRight) {
      this.ctx.scale(-1, 1);
    }
    
    let characterHeight = height;
    let yOffset = 0;
    
    if (this.isCrouchingState(player.state)) {
      characterHeight = height * 0.6;
      yOffset = height * 0.4;
    }
    
    this.ctx.fillStyle = baseColor;
    this.ctx.fillRect(-width / 2, -characterHeight + yOffset, width, characterHeight);
    
    const headSize = width * 0.6;
    const headY = -characterHeight - headSize * 0.8 + yOffset;
    this.ctx.beginPath();
    this.ctx.arc(0, headY, headSize / 2, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.fillStyle = darkColor;
    const bodyWidth = width * 0.7;
    const bodyHeight = characterHeight * 0.5;
    this.ctx.fillRect(-bodyWidth / 2, -characterHeight + yOffset + characterHeight * 0.3, bodyWidth, bodyHeight);
    
    this.renderLimbs(player, width, characterHeight, yOffset);
    
    this.ctx.restore();
  }

  private isCrouchingState(state: CharacterState): boolean {
    return [
      CharacterState.CROUCH,
      CharacterState.CROUCH_GUARD,
      CharacterState.CROUCH_LIGHT_PUNCH,
      CharacterState.CROUCH_HEAVY_PUNCH,
      CharacterState.CROUCH_LIGHT_KICK,
      CharacterState.CROUCH_HEAVY_KICK,
    ].includes(state);
  }

  private renderLimbs(player: PlayerState, width: number, height: number, yOffset: number): void {
    const limbColor = '#2d2d44';
    const limbWidth = width * 0.2;
    
    this.ctx.fillStyle = limbColor;
    
    if (this.isAttackingState(player.state)) {
      const attackProgress = Math.min(player.stateFrame / 10, 1);
      const armExtension = width * 1.5 * attackProgress;
      
      if (this.isPunchState(player.state)) {
        this.ctx.fillRect(width * 0.3, -height * 0.6 + yOffset, armExtension, limbWidth);
      } else if (this.isKickState(player.state)) {
        const kickY = this.isCrouchingState(player.state) ? -height * 0.2 + yOffset : -height * 0.3 + yOffset;
        this.ctx.fillRect(width * 0.3, kickY, armExtension, limbWidth);
      }
    }
    
    this.ctx.fillRect(-width * 0.15, yOffset - height * 0.15, limbWidth, height * 0.15);
    this.ctx.fillRect(width * 0.05, yOffset - height * 0.15, limbWidth, height * 0.15);
  }

  private isAttackingState(state: CharacterState): boolean {
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

  private isPunchState(state: CharacterState): boolean {
    return [
      CharacterState.STAND_LIGHT_PUNCH,
      CharacterState.STAND_HEAVY_PUNCH,
      CharacterState.CROUCH_LIGHT_PUNCH,
      CharacterState.CROUCH_HEAVY_PUNCH,
    ].includes(state);
  }

  private isKickState(state: CharacterState): boolean {
    return [
      CharacterState.STAND_LIGHT_KICK,
      CharacterState.STAND_HEAVY_KICK,
      CharacterState.CROUCH_LIGHT_KICK,
      CharacterState.CROUCH_HEAVY_KICK,
    ].includes(state);
  }

  private renderAllHitboxes(state: GameState): void {
    state.players.forEach((player) => {
      // Push box (green) - character collision
      const pushBox = getPushbox(BASE_CHARACTER, player.state, player.position);
      this.ctx.fillStyle = 'rgba(0, 255, 0, 0.3)';
      this.ctx.fillRect(
        this.toScreenX(pushBox.x),
        this.toScreenY(pushBox.y),
        this.toScreenWidth(pushBox.width),
        this.toScreenHeight(pushBox.height)
      );
      this.ctx.strokeStyle = 'rgba(0, 255, 0, 0.9)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        this.toScreenX(pushBox.x),
        this.toScreenY(pushBox.y),
        this.toScreenWidth(pushBox.width),
        this.toScreenHeight(pushBox.height)
      );

      // Hurtbox (blue) - per-state body box from character data
      const hurtBox = getHurtbox(BASE_CHARACTER, player.state, player.position);
      this.ctx.fillStyle = 'rgba(0, 100, 255, 0.25)';
      this.ctx.fillRect(
        this.toScreenX(hurtBox.x),
        this.toScreenY(hurtBox.y),
        this.toScreenWidth(hurtBox.width),
        this.toScreenHeight(hurtBox.height)
      );
      this.ctx.strokeStyle = 'rgba(0, 150, 255, 0.9)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(
        this.toScreenX(hurtBox.x),
        this.toScreenY(hurtBox.y),
        this.toScreenWidth(hurtBox.width),
        this.toScreenHeight(hurtBox.height)
      );

      // Hitbox (red) - per-move box, only during active frames
      const hitbox = getHitbox(
        BASE_CHARACTER,
        player.state,
        player.stateFrame,
        player.facingRight,
        player.position,
      );
      if (hitbox) {
        this.ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';
        this.ctx.fillRect(
          this.toScreenX(hitbox.x),
          this.toScreenY(hitbox.y),
          this.toScreenWidth(hitbox.width),
          this.toScreenHeight(hitbox.height)
        );
        this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.9)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(
          this.toScreenX(hitbox.x),
          this.toScreenY(hitbox.y),
          this.toScreenWidth(hitbox.width),
          this.toScreenHeight(hitbox.height)
        );

        this.ctx.fillStyle = '#ff6666';
        this.ctx.font = 'bold 11px monospace';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(
          `${player.state} F${player.stateFrame}`,
          this.toScreenX(hitbox.x),
          this.toScreenY(hitbox.y) - 4,
        );
      }
    });
  }

  private renderProjectiles(state: GameState): void {
    state.projectiles.forEach(projectile => {
      if (!projectile.active) return;
      
      const x = this.toScreenX(projectile.position.x);
      const y = this.toScreenY(projectile.position.y);
      const color = projectile.owner === 0 ? '#4ecdc4' : '#ff6b6b';
      
      this.ctx.fillStyle = color;
      this.ctx.beginPath();
      this.ctx.arc(x, y, 15, 0, Math.PI * 2);
      this.ctx.fill();
      
      this.ctx.fillStyle = 'white';
      this.ctx.beginPath();
      this.ctx.arc(x, y, 8, 0, Math.PI * 2);
      this.ctx.fill();
    });
  }

  private renderHUD(state: GameState): void {
    this.renderHealthBars(state);
    this.renderTimer(state);
    this.renderRoundIndicators(state);
    this.renderComboCounter(state);

    const introPhase = getRoundIntroPhase(state);
    if (introPhase !== 'done') {
      this.renderRoundIntro(state, introPhase);
    }
    
    if (state.isRoundOver) {
      this.renderRoundResult(state);
    }
  }

  private renderHealthBars(state: GameState): void {
    const barWidth = 500;
    const barHeight = 30;
    const barY = 30;
    const padding = 50;
    
    state.players.forEach((player, index) => {
      const barX = index === 0 ? padding : this.canvas.width - padding - barWidth;
      const healthPercent = player.health / player.maxHealth;
      
      this.ctx.fillStyle = '#333';
      this.ctx.fillRect(barX, barY, barWidth, barHeight);
      
      const healthColor = index === 0 ? '#4ecdc4' : '#ff6b6b';
      this.ctx.fillStyle = healthColor;
      
      if (index === 0) {
        this.ctx.fillRect(barX, barY, barWidth * healthPercent, barHeight);
      } else {
        const healthWidth = barWidth * healthPercent;
        this.ctx.fillRect(barX + barWidth - healthWidth, barY, healthWidth, barHeight);
      }
      
      this.ctx.strokeStyle = '#fff';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(barX, barY, barWidth, barHeight);
      
      this.ctx.fillStyle = '#fff';
      this.ctx.font = 'bold 16px monospace';
      this.ctx.textAlign = index === 0 ? 'left' : 'right';
      const textX = index === 0 ? barX : barX + barWidth;
      this.ctx.fillText(`P${index + 1}`, textX, barY - 5);
    });
  }

  private renderTimer(state: GameState): void {
    const seconds = Math.ceil(state.roundTimer / 60);
    
    this.ctx.fillStyle = '#fff';
    this.ctx.font = 'bold 48px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(seconds.toString().padStart(2, '0'), this.canvas.width / 2, 60);
  }

  private renderRoundIndicators(state: GameState): void {
    const dotSize = 12;
    const spacing = 25;
    const y = 80;
    
    for (let i = 0; i < GAME_CONFIG.ROUNDS_TO_WIN; i++) {
      const x1 = this.canvas.width / 2 - 60 - i * spacing;
      const x2 = this.canvas.width / 2 + 60 + i * spacing;
      
      this.ctx.beginPath();
      this.ctx.arc(x1, y, dotSize / 2, 0, Math.PI * 2);
      this.ctx.fillStyle = i < state.roundWins[0] ? '#4ecdc4' : '#333';
      this.ctx.fill();
      this.ctx.strokeStyle = '#fff';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
      
      this.ctx.beginPath();
      this.ctx.arc(x2, y, dotSize / 2, 0, Math.PI * 2);
      this.ctx.fillStyle = i < state.roundWins[1] ? '#ff6b6b' : '#333';
      this.ctx.fill();
      this.ctx.stroke();
    }
  }

  private renderComboCounter(state: GameState): void {
    if (state.isRoundOver || isRoundIntroActive(state)) return;

    const barWidth = 500;
    const barY = 30;
    const barHeight = 30;
    const padding = 50;
    const comboY = barY + barHeight + 36;

    state.comboDisplayCount.forEach((lingerCount, index) => {
      const liveCount = state.comboCounts[index];
      const count = liveCount >= 2 ? liveCount : lingerCount;
      if (count < 2) return;

      const comboActive = liveCount >= 2;
      if (!comboActive && state.frameNumber >= state.comboDisplayUntilFrame[index]) return;

      const text = `${count} COMBO!`;
      const barX = index === 0 ? padding : this.canvas.width - padding - barWidth;
      const textX = index === 0 ? barX : barX + barWidth;

      this.ctx.textAlign = index === 0 ? 'left' : 'right';
      this.ctx.font = 'bold 32px monospace';
      this.ctx.strokeStyle = '#000';
      this.ctx.lineWidth = 4;
      this.ctx.strokeText(text, textX, comboY);
      this.ctx.fillStyle = '#ffcc00';
      this.ctx.fillText(text, textX, comboY);
    });
  }

  private renderRoundIntro(state: GameState, phase: 'announce' | 'fight'): void {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = '#fff';

    if (phase === 'announce') {
      this.ctx.font = 'bold 72px monospace';
      this.ctx.fillText(`ROUND ${state.roundNumber}!`, this.canvas.width / 2, this.canvas.height / 2 + 20);
    } else {
      this.ctx.font = 'bold 96px monospace';
      this.ctx.fillStyle = '#ffcc00';
      this.ctx.fillText('FIGHT!', this.canvas.width / 2, this.canvas.height / 2 + 25);
    }
  }

  private renderRoundResult(state: GameState): void {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(0, this.canvas.height / 2 - 60, this.canvas.width, 120);
    
    this.ctx.fillStyle = '#fff';
    this.ctx.font = 'bold 48px monospace';
    this.ctx.textAlign = 'center';
    
    const winnerText = state.winner !== null 
      ? `PLAYER ${state.winner + 1} WINS!`
      : 'DRAW!';
    
    this.ctx.fillText(winnerText, this.canvas.width / 2, this.canvas.height / 2 + 15);

    if (state.isMatchOver) {
      this.ctx.font = 'bold 24px monospace';
      const matchResult = getMatchResult(state);
      const matchText =
        matchResult === 'draw'
          ? 'MATCH DRAW — F5 TO RESTART'
          : matchResult === 'p1'
            ? 'P1 WINS MATCH — F5 TO RESTART'
            : 'P2 WINS MATCH — F5 TO RESTART';
      this.ctx.fillText(matchText, this.canvas.width / 2, this.canvas.height / 2 + 55);
    }
  }

  private renderDebugInfo(state: GameState): void {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(10, this.canvas.height - 170, 300, 160);
    
    this.ctx.fillStyle = '#fff';
    this.ctx.font = '12px monospace';
    this.ctx.textAlign = 'left';
    
    const lines = [
      `Frame: ${state.frameNumber}`,
      `Camera: ${Math.round(this.cameraX / 100)} (Stage: ${Math.round(GAME_CONFIG.STAGE_WIDTH / 100)})`,
      `P1 State: ${state.players[0].state} (${state.players[0].stateFrame})`,
      `P1 Pos: (${Math.round(state.players[0].position.x / 100)}, ${Math.round(state.players[0].position.y / 100)})`,
      `P1 Vel: (${Math.round(state.players[0].velocity.x / 100)}, ${Math.round(state.players[0].velocity.y / 100)})`,
      `P2 State: ${state.players[1].state} (${state.players[1].stateFrame})`,
      `P2 Pos: (${Math.round(state.players[1].position.x / 100)}, ${Math.round(state.players[1].position.y / 100)})`,
      `Projectiles: ${state.projectiles.filter(p => p.active).length}`,
    ];
    
    lines.forEach((line, i) => {
      this.ctx.fillText(line, 20, this.canvas.height - 150 + i * 18);
    });
  }

  resize(width: number, height: number): void {
    this.config.canvasWidth = width;
    this.config.canvasHeight = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.scaleX = width / GAME_CONFIG.VIEWPORT_WIDTH;
    this.scaleY = height / GAME_CONFIG.VIEWPORT_HEIGHT;
  }
}
