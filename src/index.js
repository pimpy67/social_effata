import "dotenv/config";
import { startBot } from "./telegramBot.js";
import { startServer } from "./server.js";
import { logger } from "./logger.js";
import { initDatabase, closeDatabase } from "./database.js";

// Il server ha connettività intermittente verso api.telegram.org: una singola
// chiamata Telegram (es. un sendMessage dopo /genera) può andare in ConnectTimeout
// e, se il rejection non è gestito, Node 20 termina il processo -> il container
// riparta -> categoria/bozza in memoria perse -> il volontario ricomincia da capo
// all'infinito. Meglio loggare e proseguire: al massimo si perde quel messaggio,
// non tutta la sessione. Vale sia per le promise non gestite sia per le eccezioni
// sincrone che sfuggono ai callback async della libreria Telegram.
process.on("unhandledRejection", (reason) => {
  logger.error(
    `Promise rejection non gestita (ignorata per non far crashare il bot): ${reason?.stack || reason}`
  );
});
process.on("uncaughtException", (err) => {
  logger.error(
    `Eccezione non gestita (ignorata per non far crashare il bot): ${err?.stack || err}`
  );
});

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
