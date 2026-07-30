import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../src/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, "..", "logs");
const LOG_FILE = path.join(LOGS_DIR, "app.log");

describe("logger", () => {
  beforeEach(() => {
    // Pulisci il file di log prima di ogni test
    if (fs.existsSync(LOG_FILE)) {
      fs.unlinkSync(LOG_FILE);
    }
  });

  afterAll(() => {
    // Pulisci dopo i test
    if (fs.existsSync(LOG_FILE)) {
      fs.unlinkSync(LOG_FILE);
    }
  });

  test("logger.info scrive nel file", (done) => {
    logger.info("Test messaggio info");

    setTimeout(() => {
      const content = fs.readFileSync(LOG_FILE, "utf-8");
      expect(content).toContain("Test messaggio info");
      expect(content).toContain("INFO");
      done();
    }, 100);
  });

  test("logger.error scrive nel file", (done) => {
    logger.error("Test messaggio error");

    setTimeout(() => {
      const content = fs.readFileSync(LOG_FILE, "utf-8");
      expect(content).toContain("Test messaggio error");
      expect(content).toContain("ERROR");
      done();
    }, 100);
  });

  test("logger.warn scrive nel file", (done) => {
    logger.warn("Test messaggio warn");

    setTimeout(() => {
      const content = fs.readFileSync(LOG_FILE, "utf-8");
      expect(content).toContain("Test messaggio warn");
      expect(content).toContain("WARN");
      done();
    }, 100);
  });

  test("logger.debug scrive nel file", (done) => {
    logger.debug("Test messaggio debug");

    setTimeout(() => {
      const content = fs.readFileSync(LOG_FILE, "utf-8");
      expect(content).toContain("Test messaggio debug");
      expect(content).toContain("DEBUG");
      done();
    }, 100);
  });

  test("logger include timestamp ISO", (done) => {
    logger.info("Test con timestamp");

    setTimeout(() => {
      const content = fs.readFileSync(LOG_FILE, "utf-8");
      // Controlla che c'è un formato ISO timestamp (es. 2026-07-31T...)
      expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      done();
    }, 100);
  });

  test("logger include livello log", (done) => {
    logger.info("Info");
    logger.warn("Warn");
    logger.error("Error");
    logger.debug("Debug");

    setTimeout(() => {
      const content = fs.readFileSync(LOG_FILE, "utf-8");
      expect(content).toContain("INFO");
      expect(content).toContain("WARN");
      expect(content).toContain("ERROR");
      expect(content).toContain("DEBUG");
      done();
    }, 100);
  });

  test("logger scrive righe multiple", (done) => {
    logger.info("Riga 1");
    logger.info("Riga 2");
    logger.info("Riga 3");

    setTimeout(() => {
      const content = fs.readFileSync(LOG_FILE, "utf-8");
      const lines = content.split("\n").filter((l) => l.length > 0);
      expect(lines.length).toBeGreaterThanOrEqual(3);
      done();
    }, 100);
  });
});
