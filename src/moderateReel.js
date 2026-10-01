#!/usr/bin/env node

import "dotenv/config";
import { logger } from "./logger.js";
import { initMetaAPI } from "./metaAPI.js";
import { startCommentModerator } from "./commentModerator.js";

// Estrae l'ID del post da un URL Facebook (formato: https://www.facebook.com/share/v/ID)
// o accetta direttamente un ID numerico
function extractPostId(input) {
  if (!input) return null;

  if (/^\d+$/.test(input)) {
    return input;
  }

  const match = input.match(/\/share\/v\/([a-zA-Z0-9]+)/);
  if (match) {
    return match[1];
  }

  return null;
}

(async () => {
  try {
    logger.info("🤖 Moderatore Commenti - Effatá");
    logger.info("================================\n");

    const metaAPI = await initMetaAPI();
    if (!metaAPI) {
      logger.error("❌ MetaAPI non inizializzata. Controlla le credenziali in .env");
      process.exit(1);
    }

    // Leggi il post ID da:
    // 1. Argomento da riga di comando
    // 2. Variabile d'ambiente
    // 3. Prompt interattivo
    let postId = process.argv[2] || process.env.MODERATE_POST_ID;

    if (!postId) {
      logger.info("📝 Inserisci l'ID o il link del reel/post:");
      logger.info("   Es: 1GMQSp73ce");
      logger.info("   Es: https://www.facebook.com/share/v/1GMQSp73ce/\n");

      postId = await new Promise((resolve) => {
        process.stdout.write("> ");
        let input = "";
        process.stdin.on("data", (chunk) => {
          input += chunk;
          if (input.includes("\n")) {
            process.stdin.removeAllListeners("data");
            resolve(input.trim());
          }
        });
      });
    }

    postId = extractPostId(postId);
    if (!postId) {
      logger.error("❌ ID del post non valido");
      process.exit(1);
    }

    logger.info(`\n✅ Moderazione avviata per il post: ${postId}`);
    logger.info(`⏰ I commenti verranno controllati ogni 5 minuti`);
    logger.info(`📋 I commenti razzisti verranno nascosti automaticamente\n`);
    logger.info("Premi CTRL+C per interrompere\n");

    const moderator = await startCommentModerator(metaAPI, postId, 5);

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
