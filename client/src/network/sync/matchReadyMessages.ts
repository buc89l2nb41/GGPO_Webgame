export interface MatchReadyMessage {
  type: 'match-ready';
}

export function isMatchReadyMessage(data: unknown): data is MatchReadyMessage {
  if (typeof data !== 'object' || data === null || !('type' in data)) return false;
  return (data as { type: string }).type === 'match-ready';
}
