import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initDatabase, saveDraft } from "../src/database.js";
import { logger } from "../src/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "..", "output");

async function recoverDrafts() {
  try {
    await initDatabase();
    logger.info("Database inizializzato");

    if (!fs.existsSync(OUTPUT_DIR)) {
      logger.error("Cartella output non trovata");
      process.exit(1);
    }

    const files = fs.readdirSync(OUTPUT_DIR);
    const drafts = {};

    // Raggruppa i file per timestamp
    files.forEach((file) => {
      const match = file.match(/^(\d+)_(.+?)(?:\.\w+)?$/);
      if (match) {
        const [, timestamp, type] = match;
        if (!drafts[timestamp]) {
          drafts[timestamp] = {
            timestamp,
            formats: [],
            photoCount: 0,
          };
        }

        if (type === "facebook" || type === "instagram" || type === "blog" || type === "linkedin" || type === "reel") {
          drafts[timestamp].formats.push(type);
        } else if (/^\d+$/.test(type)) {
          drafts[timestamp].photoCount = Math.max(drafts[timestamp].photoCount, parseInt(type));
        }
      }
    });

    // Recupera ogni bozza nel database
    let recovered = 0;
    for (const [timestamp, info] of Object.entries(drafts)) {
      try {
        saveDraft(
          timestamp,
          info.photoCount,
          info.formats,
          0, // textLength non disponibile
          null, // category
          null, // categoryNumber
          null, // categoryData
          null  // facebookPostId
        );
        recovered++;
        logger.info(`✅ Recuperato: ${timestamp} (${info.photoCount} foto, ${info.formats.join(", ")})`);
      } catch (err) {
        logger.error(`❌ Errore nel recuperare ${timestamp}: ${err.message}`);
      }
    }

    logger.info(`\n✅ Recupero completato: ${recovered} bozze ripristinate`);
    process.exit(0);
  } catch (err) {
    logger.error(`Errore critico: ${err.message}`);
    process.exit(1);
  }
}

recoverDrafts();
