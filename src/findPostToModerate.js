#!/usr/bin/env node

import "dotenv/config";
import { logger } from "./logger.js";
import { initMetaAPI } from "./metaAPI.js";
import { startCommentModerator } from "./commentModerator.js";

(async () => {
  try {
    logger.info("📋 Ricerca post da moderare...\n");

    const metaAPI = await initMetaAPI();
    if (!metaAPI) {
      logger.error("❌ MetaAPI non inizializzata");
      process.exit(1);
    }

    const response = await fetch(
      `https://graph.facebook.com/v26.0/${metaAPI.pageId}/feed?fields=id,message,created_time,comments.summary(true).limit(0)&limit=10`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${metaAPI.pageAccessToken}`,
        },
      }
    ).then((res) => res.json());

    const posts = response.data || [];

    if (posts.length === 0) {
      logger.error("❌ Nessun post trovato");
      process.exit(1);
    }

    logger.info("📌 Post recenti della pagina:\n");
    posts.forEach((post, idx) => {
      const date = new Date(post.created_time).toLocaleString("it-IT");
      const commentCount = post.comments?.summary?.total_count || 0;
      logger.info(`${idx + 1}. ${date} (${commentCount} commenti)`);
      logger.info(`   ID: ${post.id}`);
      if (post.message) {
        logger.info(`   "${post.message.substring(0, 60)}..."\n`);
      }
    });

    logger.info("\n✅ Iniziando moderazione del post più recente:");
    logger.info(`   ID: ${posts[0].id}`);
    logger.info(`   Polling ogni 5 minuti...\n`);

    const moderator = await startCommentModerator(metaAPI, posts[0].id, 5);

    process.on("SIGINT", () => {
      logger.info("\n⏹ Moderazione interrotta");
      moderator.stop();
      process.exit(0);
    });
  } catch (err) {
    logger.error(`Errore: ${err.message}`);
    process.exit(1);
  }
})();
