import { PeerConnection } from '../webrtc/PeerConnection';

const COUNTDOWN_SECONDS = [3, 2, 1] as const;
const FIGHT_DISPLAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Waits until both peers finish local asset loading, then runs a short countdown
 * so the online match starts on the same frame for both players.
 */
export class MatchReadyGate {
  private localReady = false;
  private remoteReady = false;
  private countdownStarted = false;
  private resolveStart: (() => void) | null = null;
  private readonly startPromise: Promise<void>;

  constructor(
    private readonly peerConnection: PeerConnection,
    private readonly onPhaseChange: (message: string) => void,
  ) {
    this.startPromise = new Promise((resolve) => {
      this.resolveStart = resolve;
    });

    this.peerConnection.setMatchReadyListener(() => {
      this.onRemoteReady();
    });
  }

  signalLocalReady(): void {
    this.localReady = true;
    this.peerConnection.sendMatchReady();
    void this.tryStartCountdown();
  }

  waitForStart(): Promise<void> {
    return this.startPromise;
  }

  dispose(): void {
    this.peerConnection.setMatchReadyListener(null);
    this.resolveStart = null;
  }

  private onRemoteReady(): void {
    if (this.remoteReady) return;
    this.remoteReady = true;
    void this.tryStartCountdown();
  }

  private async tryStartCountdown(): Promise<void> {
    if (this.countdownStarted || !this.localReady || !this.remoteReady) {
      return;
    }

    this.countdownStarted = true;
    this.onPhaseChange('Get ready...');

    for (const second of COUNTDOWN_SECONDS) {
      this.onPhaseChange(String(second));
      await sleep(1000);
    }

    this.onPhaseChange('FIGHT!');
    await sleep(FIGHT_DISPLAY_MS);
    this.resolveStart?.();
  }
}
