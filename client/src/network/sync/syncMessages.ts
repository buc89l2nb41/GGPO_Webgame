export interface SyncCheckMessage {
  type: 'sync-check';
  requestId: number;
  frame: number;
  checksum: number;
}

export interface SyncAckMessage {
  type: 'sync-ack';
  requestId: number;
  frame: number;
  checksum: number;
}

export type SyncWireMessage = SyncCheckMessage | SyncAckMessage;

export function isSyncWireMessage(data: unknown): data is SyncWireMessage {
  if (typeof data !== 'object' || data === null || !('type' in data)) return false;
  const type = (data as { type: string }).type;
  return type === 'sync-check' || type === 'sync-ack';
}
