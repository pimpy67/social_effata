import "dotenv/config";
import { startBot } from "./telegramBot.js";
import { logger } from "./logger.js";

try {
  startBot();
} catch (err) {
  logger.error(`Errore fatale all'avvio: ${err.message}`);
  process.exit(1);
}
