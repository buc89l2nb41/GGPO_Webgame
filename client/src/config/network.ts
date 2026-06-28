/**
 * Signaling server URL for online play.
 * Uses the same host as the game page so LAN devices reach the PC running the server.
 */
export function getSignalingServerUrl(): string {
  const fromEnv = import.meta.env.VITE_SIGNALING_URL;
  if (typeof fromEnv === 'string' && fromEnv.length > 0) {
    return fromEnv;
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:3001';
  }

  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:3001`;
}
