import { SyncAckMessage, SyncCheckMessage } from './syncMessages';

export type SyncHealthStatus = 'synced' | 'unstable' | 'recovering' | 'failed';

export interface SyncHealthSnapshot {
  status: SyncHealthStatus;
  message: string;
  frameAdvantage: number;
  recoveryAttempt: number;
}

const WARMUP_FRAMES = 180;
const UNSTABLE_AFTER_MS = 400;
const RECOVER_AFTER_MS = 1200;
const STALE_CONFIRMED_MS = 1200;
const STALE_INPUT_MS = 1200;
const MAX_FRAME_ADVANTAGE = 10;
const MAX_FRAME_DRIFT = 2;
const RECOVERY_ATTEMPTS = 3;
const RECOVERY_TIMEOUT_MS = 2000;

export class SyncHealthMonitor {
  private status: SyncHealthStatus = 'synced';
  private message = 'Synced';
  private lastConfirmedFrame = -1;
  private lastConfirmedAdvanceAt = performance.now();
  private lastRemoteInputAt = performance.now();
  private unhealthySince: number | null = null;
  private recoveryAttempt = 0;
  private recoveryStartedAt: number | null = null;
  private pendingRequestId: number | null = null;
  private requestIdCounter = 0;
  private failureReason: string | null = null;

  reset(): void {
    this.status = 'synced';
    this.message = 'Synced';
    this.lastConfirmedFrame = -1;
    this.lastConfirmedAdvanceAt = performance.now();
    this.lastRemoteInputAt = performance.now();
    this.unhealthySince = null;
    this.recoveryAttempt = 0;
    this.recoveryStartedAt = null;
    this.pendingRequestId = null;
    this.failureReason = null;
  }

  notifyRemoteInput(): void {
    this.lastRemoteInputAt = performance.now();
  }

  getStatus(): SyncHealthStatus {
    return this.status;
  }

  getMessage(): string {
    return this.message;
  }

  shouldPauseSimulation(): boolean {
    return this.status === 'recovering' || this.status === 'failed';
  }

  consumeFailure(): string | null {
    const reason = this.failureReason;
    this.failureReason = null;
    return reason;
  }

  getSnapshot(frameAdvantage: number): SyncHealthSnapshot {
    return {
      status: this.status,
      message: this.message,
      frameAdvantage,
      recoveryAttempt: this.recoveryAttempt,
    };
  }

  tick(params: {
    now: number;
    currentFrame: number;
    lastConfirmedFrame: number;
    frameAdvantage: number;
    peerConnected: boolean;
    getChecksum: () => number;
    sendSyncCheck: (message: SyncCheckMessage) => void;
  }): void {
    if (this.status === 'failed') return;

    if (!params.peerConnected) {
      this.fail('Connection lost');
      return;
    }

    if (params.lastConfirmedFrame > this.lastConfirmedFrame) {
      this.lastConfirmedFrame = params.lastConfirmedFrame;
      this.lastConfirmedAdvanceAt = params.now;
      if (this.status === 'unstable') {
        this.setStatus('synced', 'Synced');
        this.unhealthySince = null;
      }
    }

    if (this.status === 'recovering') {
      this.tickRecovery(params);
      return;
    }

    if (params.currentFrame < WARMUP_FRAMES) {
      return;
    }

    const staleConfirmed = params.now - this.lastConfirmedAdvanceAt > STALE_CONFIRMED_MS;
    const staleInput = params.now - this.lastRemoteInputAt > STALE_INPUT_MS;
    const highAdvantage = params.frameAdvantage >= MAX_FRAME_ADVANTAGE;
    const unhealthy = staleConfirmed || staleInput || highAdvantage;

    if (!unhealthy) {
      this.unhealthySince = null;
      if (this.status !== 'synced') {
        this.setStatus('synced', 'Synced');
      }
      return;
    }

    if (!this.unhealthySince) {
      this.unhealthySince = params.now;
    }

    const unhealthyDuration = params.now - this.unhealthySince;

    if (unhealthyDuration >= UNSTABLE_AFTER_MS && this.status === 'synced') {
      this.setStatus('unstable', this.describeUnhealthy(staleConfirmed, staleInput, highAdvantage));
    }

    if (unhealthyDuration >= RECOVER_AFTER_MS && this.status === 'unstable') {
      this.startRecovery(params);
    }
  }

  handleSyncCheck(
    message: SyncCheckMessage,
    getChecksum: () => number,
    getCurrentFrame: () => number,
  ): SyncAckMessage {
    return {
      type: 'sync-ack',
      requestId: message.requestId,
      frame: getCurrentFrame(),
      checksum: getChecksum(),
    };
  }

  handleSyncAck(
    message: SyncAckMessage,
    params: {
      localFrame: number;
      localChecksum: number;
      now: number;
      lastConfirmedFrame: number;
      frameAdvantage: number;
      peerConnected: boolean;
      getChecksum: () => number;
      sendSyncCheck: (message: SyncCheckMessage) => void;
    },
  ): void {
    if (this.status !== 'recovering' || this.pendingRequestId !== message.requestId) {
      return;
    }

    const frameDrift = Math.abs(params.localFrame - message.frame);
    const checksumMatch = message.checksum === params.localChecksum;
    const frameMatch = frameDrift <= MAX_FRAME_DRIFT;

    if (frameMatch && checksumMatch) {
      this.setStatus('synced', 'Sync restored');
      this.unhealthySince = null;
      this.recoveryAttempt = 0;
      this.recoveryStartedAt = null;
      this.pendingRequestId = null;
      return;
    }

    const reason = !frameMatch
      ? `Frame mismatch (local ${params.localFrame}, remote ${message.frame})`
      : `State mismatch at frame ${message.frame}`;

    this.retryOrFail(reason, {
      now: params.now,
      currentFrame: params.localFrame,
      getChecksum: params.getChecksum,
      sendSyncCheck: params.sendSyncCheck,
    });
  }

  private tickRecovery(params: {
    now: number;
    currentFrame: number;
    getChecksum: () => number;
    sendSyncCheck: (message: SyncCheckMessage) => void;
  }): void {
    if (
      this.recoveryStartedAt !== null &&
      params.now - this.recoveryStartedAt > RECOVERY_TIMEOUT_MS
    ) {
      this.retryOrFail('Sync check timed out', params);
    }
  }

  private sendSyncCheckRequest(params: {
    now: number;
    currentFrame: number;
    getChecksum: () => number;
    sendSyncCheck: (message: SyncCheckMessage) => void;
  }): void {
    const requestId = ++this.requestIdCounter;
    this.pendingRequestId = requestId;
    this.recoveryStartedAt = params.now;

    params.sendSyncCheck({
      type: 'sync-check',
      requestId,
      frame: params.currentFrame,
      checksum: params.getChecksum(),
    });
  }

  private startRecovery(params: {
    now: number;
    currentFrame: number;
    getChecksum: () => number;
    sendSyncCheck: (message: SyncCheckMessage) => void;
  }): void {
    if (this.status === 'recovering') return;

    this.recoveryAttempt += 1;
    this.setStatus(
      'recovering',
      `Resyncing... (${this.recoveryAttempt}/${RECOVERY_ATTEMPTS})`,
    );

    this.sendSyncCheckRequest(params);
  }

  private retryOrFail(
    reason: string,
    params: {
      now: number;
      currentFrame: number;
      getChecksum: () => number;
      sendSyncCheck: (message: SyncCheckMessage) => void;
    },
  ): void {
    if (this.recoveryAttempt >= RECOVERY_ATTEMPTS) {
      this.fail(`Could not restore sync: ${reason}`);
      return;
    }

    this.recoveryAttempt += 1;
    this.setStatus(
      'recovering',
      `Retrying sync (${this.recoveryAttempt}/${RECOVERY_ATTEMPTS})...`,
    );
    this.sendSyncCheckRequest(params);
  }

  private fail(reason: string): void {
    this.status = 'failed';
    this.message = reason;
    this.failureReason = reason;
    this.pendingRequestId = null;
    this.recoveryStartedAt = null;
  }

  private setStatus(status: SyncHealthStatus, message: string): void {
    this.status = status;
    this.message = message;
  }

  private describeUnhealthy(
    staleConfirmed: boolean,
    staleInput: boolean,
    highAdvantage: boolean,
  ): string {
    if (staleInput) return 'Waiting for opponent input...';
    if (staleConfirmed) return 'Opponent inputs delayed';
    if (highAdvantage) return 'Sync unstable';
    return 'Sync unstable';
  }
}
