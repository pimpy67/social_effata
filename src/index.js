import "dotenv/config";
import { startBot } from "./telegramBot.js";
import { startServer } from "./server.js";
import { logger } from "./logger.js";
import { initDatabase, closeDatabase } from "./database.js";

(async () => {
  try {
    logger.info("Effatá Social Automation Bot + Dashboard");
    await initDatabase();
    await startBot();
    startServer();

    // Chiudi il database in modo sicuro al termine
    process.on("SIGINT", () => {
      logger.info("Chiusura in corso...");
      closeDatabase();
      process.exit(0);
    });
  } catch (err) {
    logger.error(`Errore fatale all'avvio: ${err.message}`);
    process.exit(1);
  }
})();
