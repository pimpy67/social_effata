import { logger } from "./logger.js";
import { moderateComment } from "./moderationFilter.js";
import { MetaAPI } from "./metaAPI.js";

class CommentModerator {
  constructor(metaAPI, postId, pollIntervalMinutes = 5) {
    this.metaAPI = metaAPI;
    this.postId = postId;
    this.pollIntervalMs = pollIntervalMinutes * 60 * 1000;
    this.processedCommentIds = new Set();
    this.isRunning = false;
  }

  async fetchAndModerateComments() {
    if (!this.metaAPI || !this.postId) {
      logger.warn("CommentModerator: MetaAPI o postId non disponibili");
      return;
    }

    try {
      logger.info(`Inizio moderazione commenti per il post ${this.postId}`);

      const response = await fetch(
        `https://graph.facebook.com/v26.0/${this.postId}/comments`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${this.metaAPI.pageAccessToken}`,
          },
        }
      ).then((res) => res.json());

      const comments = response.data || [];
      logger.info(`Trovati ${comments.length} commenti da moderare`);

      let blockedCount = 0;
      let flaggedCount = 0;

      for (const comment of comments) {
        const commentId = comment.id;

        if (this.processedCommentIds.has(commentId)) {
          continue;
        }

        const commentData = {
          commentId,
          text: comment.message || "",
          authorName: comment.from?.name || "Anonimo",
          authorId: comment.from?.id || null,
          platform: "facebook",
          postId: this.postId,
        };

        const moderationResult = moderateComment(commentData);

        if (moderationResult.status === "BLOCK") {
          blockedCount++;
          logger.warn(
            `[MODERATION BLOCK] ${commentData.authorName} - Score: ${moderationResult.score}`
          );
          logger.debug(`Contenuto: "${commentData.text.substring(0, 200)}..."`);

          try {
            await this.metaAPI.hideComment(commentId);
            logger.info(`✅ Commento ${commentId} nascosto con successo`);
          } catch (err) {
            logger.error(`❌ Impossibile nascondere il commento ${commentId}: ${err.message}`);
          }
        } else if (moderationResult.status === "FLAG") {
          flaggedCount++;
          logger.warn(
            `[MODERATION FLAG] ${commentData.authorName} - Score: ${moderationResult.score}`
          );
          logger.debug(`Contenuto: "${commentData.text.substring(0, 200)}..."`);
        }

        this.processedCommentIds.add(commentId);
      }

      logger.info(
        `Moderazione completata: ${blockedCount} bloccati, ${flaggedCount} flaggati, ${comments.length - blockedCount - flaggedCount} OK`
      );
    } catch (err) {
      logger.error(`Errore durante la moderazione: ${err.message}`);
    }
  }

  start() {
    if (this.isRunning) {
      logger.warn("CommentModerator è già in esecuzione");
      return;
    }

    this.isRunning = true;
    logger.info(
      `✅ CommentModerator avviato per il post ${this.postId} (polling ogni ${this.pollIntervalMs / 60000} minuti)`
    );

    this.fetchAndModerateComments();
    this.pollingInterval = setInterval(() => {
      this.fetchAndModerateComments();
    }, this.pollIntervalMs);
  }

  stop() {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.isRunning = false;
      logger.info("CommentModerator fermato");
    }
  }
}

export async function startCommentModerator(metaAPI, postId, pollIntervalMinutes = 5) {
  if (!metaAPI) {
    logger.error("MetaAPI non disponibile per CommentModerator");
    return null;
  }

  const moderator = new CommentModerator(metaAPI, postId, pollIntervalMinutes);
  moderator.start();
  return moderator;
}

export { CommentModerator };
