/**
 * Simple Matchmaking System
 * Matches players in a queue for quick play
 */

interface QueuedPlayer {
  id: string;
  joinedAt: number;
  rating?: number;
}

export class Matchmaking {
  private queue: QueuedPlayer[] = [];
  private matchTimeout: number = 30000;

  addPlayer(playerId: string, rating?: number): { matched: boolean; opponent?: string } {
    this.cleanupStaleEntries();
    
    const existingIndex = this.queue.findIndex(p => p.id === playerId);
    if (existingIndex !== -1) {
      this.queue.splice(existingIndex, 1);
    }
    
    if (this.queue.length > 0) {
      const opponent = this.findBestMatch(rating);
      if (opponent) {
        this.queue = this.queue.filter(p => p.id !== opponent.id);
        return { matched: true, opponent: opponent.id };
      }
    }
    
    this.queue.push({
      id: playerId,
      joinedAt: Date.now(),
      rating,
    });
    
    return { matched: false };
  }

  removePlayer(playerId: string): boolean {
    const index = this.queue.findIndex(p => p.id === playerId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      return true;
    }
    return false;
  }

  private findBestMatch(rating?: number): QueuedPlayer | null {
    if (this.queue.length === 0) return null;
    
    if (rating === undefined) {
      return this.queue[0];
    }
    
    let bestMatch: QueuedPlayer | null = null;
    let bestDiff = Infinity;
    
    for (const player of this.queue) {
      const diff = player.rating !== undefined 
        ? Math.abs(player.rating - rating)
        : 0;
      
      if (diff < bestDiff) {
        bestDiff = diff;
        bestMatch = player;
      }
    }
    
    return bestMatch;
  }

  private cleanupStaleEntries(): void {
    const now = Date.now();
    this.queue = this.queue.filter(p => now - p.joinedAt < this.matchTimeout);
  }

  getQueueLength(): number {
    this.cleanupStaleEntries();
    return this.queue.length;
  }

  isPlayerInQueue(playerId: string): boolean {
    return this.queue.some(p => p.id === playerId);
  }

  getQueueStats(): { length: number; avgWaitTime: number } {
    this.cleanupStaleEntries();
    
    if (this.queue.length === 0) {
      return { length: 0, avgWaitTime: 0 };
    }
    
    const now = Date.now();
    const totalWaitTime = this.queue.reduce((sum, p) => sum + (now - p.joinedAt), 0);
    
    return {
      length: this.queue.length,
      avgWaitTime: Math.round(totalWaitTime / this.queue.length),
    };
  }
}
