import "dotenv/config";
import { startBot } from "./telegramBot.js";
import { startServer } from "./server.js";
import { logger } from "./logger.js";

try {
  logger.info("Effatá Social Automation Bot + Dashboard");
  startBot();
  startServer();
} catch (err) {
  logger.error(`Errore fatale all'avvio: ${err.message}`);
  process.exit(1);
}
