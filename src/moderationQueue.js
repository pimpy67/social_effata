import { logger } from "./logger.js";

class ModerationQueue {
  constructor() {
    this.queue = [];
    this.processed = [];
  }

  add(entry) {
    this.queue.push(entry);
    logger.info(`Commento aggiunto alla coda: ${entry.commentId}`);
  }

  getAll() {
    return {
      pending: this.queue.filter((e) => e.action === "PENDING"),
      approved: this.processed.filter((e) => e.action === "APPROVED"),
      rejected: this.processed.filter((e) => e.action === "REJECTED"),
      total: this.queue.length + this.processed.length,
    };
  }

  approve(commentId) {
    const entry = this.queue.find((e) => e.commentId === commentId);
    if (entry) {
      entry.action = "APPROVED";
      entry.reviewedAt = new Date().toISOString();
      this.processed.push(entry);
      this.queue = this.queue.filter((e) => e.commentId !== commentId);
      logger.info(`Commento approvato: ${commentId}`);
      return entry;
    }
    return null;
  }

  reject(commentId) {
    const entry = this.queue.find((e) => e.commentId === commentId);
    if (entry) {
      entry.action = "REJECTED";
      entry.reviewedAt = new Date().toISOString();
      this.processed.push(entry);
      this.queue = this.queue.filter((e) => e.commentId !== commentId);
      logger.info(`Commento rifiutato: ${commentId}`);
      return entry;
    }
    return null;
  }

  export() {
    return {
      exported_at: new Date().toISOString(),
      pending: this.getAll().pending,
      processed: this.processed,
    };
  }
}

export const moderationQueue = new ModerationQueue();

// Endpoint per la dashboard di moderazione
export function getModerationDashboard() {
  const stats = moderationQueue.getAll();
  return {
    summary: {
      pending: stats.pending.length,
      approved: stats.approved.length,
      rejected: stats.rejected.length,
    },
    pending: stats.pending.map((e) => ({
      id: e.commentId,
      author: e.author,
      platform: e.platform,
      text: e.text.substring(0, 100) + (e.text.length > 100 ? "..." : ""),
      score: e.score,
      reason: e.reason,
      timestamp: e.timestamp,
    })),
  };
}
