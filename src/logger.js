import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, "..", "logs");

// Crea la cartella logs se non esiste
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const LOG_FILE = path.join(LOGS_DIR, "app.log");
const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB

const LEVELS = {
  debug: { level: 0, color: "\x1b[36m" },    // Cyan
  info: { level: 1, color: "\x1b[32m" },     // Green
  warn: { level: 2, color: "\x1b[33m" },     // Yellow
  error: { level: 3, color: "\x1b[31m" },    // Red
};

const RESET = "\x1b[0m";

function getTimestamp() {
  return new Date().toISOString();
}

function formatMessage(level, message) {
  const timestamp = getTimestamp();
  const levelUpper = level.toUpperCase().padEnd(5);
  return `[${timestamp}] ${levelUpper} ${message}`;
}

function rotateLogs() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stats = fs.statSync(LOG_FILE);
      if (stats.size > MAX_LOG_SIZE) {
        const date = getTimestamp().split("T")[0];
        const archive = path.join(LOGS_DIR, `app.log.${date}.${Date.now()}`);
        fs.renameSync(LOG_FILE, archive);
      }
    }
  } catch (err) {
    console.error("Errore nella rotazione dei log:", err.message);
  }
}

function writeLog(level, message) {
  const formatted = formatMessage(level, message);

  // Console con colori
  const levelInfo = LEVELS[level];
  console.log(`${levelInfo.color}${formatted}${RESET}`);

  // File
  rotateLogs();
  try {
    fs.appendFileSync(LOG_FILE, formatted + "\n", "utf-8");
  } catch (err) {
    console.error("Errore nella scrittura del log:", err.message);
  }
}

export const logger = {
  debug: (msg) => writeLog("debug", msg),
  info: (msg) => writeLog("info", msg),
  warn: (msg) => writeLog("warn", msg),
  error: (msg) => writeLog("error", msg),
};
