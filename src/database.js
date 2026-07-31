import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "effata.db");

let db = null;
let SQL = null;

export async function initDatabase() {
  try {
    SQL = await initSqlJs();

    // Carica il database se esiste, altrimenti crea uno nuovo
    if (fs.existsSync(DB_PATH)) {
      const data = fs.readFileSync(DB_PATH);
      db = new SQL.Database(data);
      logger.info("Database caricato da file");
    } else {
      db = new SQL.Database();
      logger.info("Nuovo database creato");
    }

    // Crea le tabelle se non esistono
    createTables();
    saveDatabase();

    logger.info("Database inizializzato");
  } catch (err) {
    logger.error(`Errore nell'inizializzazione database: ${err.message}`);
    throw err;
  }
}

function createTables() {
  try {
    db.run(`
      CREATE TABLE IF NOT EXISTS drafts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL UNIQUE,
        createdAt TEXT NOT NULL,
        category TEXT,
        categoryNumber INTEGER,
        photoCount INTEGER NOT NULL,
        formats TEXT NOT NULL,
        textLength INTEGER NOT NULL
      )
    `);

    logger.debug("Tabella 'drafts' creata/verificata");
  } catch (err) {
    logger.error(`Errore nella creazione tabelle: ${err.message}`);
  }
}

export function saveDraft(timestamp, photoCount, formats, textLength, category = null, categoryNumber = null) {
  try {
    const createdAt = new Date(parseInt(timestamp)).toISOString();
    const formatsJson = JSON.stringify(formats);

    db.run(
      `INSERT OR REPLACE INTO drafts (timestamp, createdAt, category, categoryNumber, photoCount, formats, textLength)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [timestamp, createdAt, category, categoryNumber, photoCount, formatsJson, textLength]
    );

    saveDatabase();
    logger.info(`Bozza salvata: timestamp=${timestamp}, categoria=${category || "nessuna"}, foto=${photoCount}`);
  } catch (err) {
    logger.error(`Errore nel salvare bozza: ${err.message}`);
  }
}

export function getAllDrafts() {
  try {
    const stmt = db.prepare(`
      SELECT timestamp, createdAt, photoCount, formats, textLength
      FROM drafts
      ORDER BY timestamp DESC
    `);

    const drafts = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      drafts.push({
        timestamp: row.timestamp,
        createdAt: row.createdAt,
        photoCount: row.photoCount,
        formats: JSON.parse(row.formats),
        textLength: row.textLength,
      });
    }

    stmt.free();
    return drafts;
  } catch (err) {
    logger.error(`Errore nel recuperare bozze: ${err.message}`);
    return [];
  }
}

export function queryDrafts(filters = {}) {
  try {
    let query = `SELECT * FROM drafts WHERE 1=1`;
    const params = [];

    // Filtro per data (es. ultime 7 giorni)
    if (filters.daysAgo) {
      const cutoffTime = Date.now() - filters.daysAgo * 24 * 60 * 60 * 1000;
      query += ` AND timestamp > ?`;
      params.push(cutoffTime);
    }

    // Filtro per numero di foto
    if (filters.photoCountMin) {
      query += ` AND photoCount >= ?`;
      params.push(filters.photoCountMin);
    }

    if (filters.photoCountMax) {
      query += ` AND photoCount <= ?`;
      params.push(filters.photoCountMax);
    }

    // Filtro per canale
    if (filters.channel) {
      query += ` AND formats LIKE ?`;
      params.push(`%"${filters.channel}"%`);
    }

    query += ` ORDER BY timestamp DESC`;

    const stmt = db.prepare(query);
    const drafts = [];

    while (stmt.step()) {
      const row = stmt.getAsObject();
      drafts.push({
        timestamp: row.timestamp,
        createdAt: row.createdAt,
        photoCount: row.photoCount,
        formats: JSON.parse(row.formats),
        textLength: row.textLength,
      });
    }

    stmt.free();
    logger.debug(`Query database: ${drafts.length} bozze trovate`);
    return drafts;
  } catch (err) {
    logger.error(`Errore nella query database: ${err.message}`);
    return [];
  }
}

export function getStatistics() {
  try {
    const stmt = db.prepare(`
      SELECT
        COUNT(*) as totalDrafts,
        SUM(photoCount) as totalPhotos,
        AVG(photoCount) as avgPhotos,
        MIN(photoCount) as minPhotos,
        MAX(photoCount) as maxPhotos,
        AVG(textLength) as avgTextLength,
        MAX(timestamp) as lastDraftTime
      FROM drafts
    `);

    stmt.step();
    const stats = stmt.getAsObject();
    stmt.free();

    return {
      totalDrafts: stats.totalDrafts || 0,
      totalPhotos: stats.totalPhotos || 0,
      avgPhotos: stats.avgPhotos ? Math.round(stats.avgPhotos) : 0,
      minPhotos: stats.minPhotos || 0,
      maxPhotos: stats.maxPhotos || 0,
      avgTextLength: stats.avgTextLength ? Math.round(stats.avgTextLength) : 0,
      lastDraftTime: stats.lastDraftTime ? new Date(parseInt(stats.lastDraftTime)).toISOString() : null,
    };
  } catch (err) {
    logger.error(`Errore nel recuperare statistiche: ${err.message}`);
    return {};
  }
}

function saveDatabase() {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    logger.error(`Errore nel salvare database: ${err.message}`);
  }
}

export function getMonthlyReport(year, month) {
  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 1);
    const startTime = startDate.getTime();
    const endTime = endDate.getTime();

    const stmt = db.prepare(`
      SELECT category, COUNT(*) as count
      FROM drafts
      WHERE timestamp >= ? AND timestamp < ? AND category IS NOT NULL
      GROUP BY category
      ORDER BY category
    `);

    const report = {};
    let total = 0;

    db.bind([startTime, endTime]);
    while (stmt.step()) {
      const row = stmt.getAsObject();
      report[row.category] = row.count;
      total += row.count;
    }

    stmt.free();

    return {
      year,
      month,
      monthName: new Date(year, month - 1).toLocaleString("it-IT", { month: "long", year: "numeric" }),
      report,
      total,
    };
  } catch (err) {
    logger.error(`Errore nel generare report mensile: ${err.message}`);
    return {};
  }
}

export function getYearlyReport(year) {
  try {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 1);
    const startTime = startDate.getTime();
    const endTime = endDate.getTime();

    const stmt = db.prepare(`
      SELECT category, COUNT(*) as count
      FROM drafts
      WHERE timestamp >= ? AND timestamp < ? AND category IS NOT NULL
      GROUP BY category
      ORDER BY category
    `);

    const report = {};
    let total = 0;

    db.bind([startTime, endTime]);
    while (stmt.step()) {
      const row = stmt.getAsObject();
      report[row.category] = row.count;
      total += row.count;
    }

    stmt.free();

    return {
      year,
      report,
      total,
    };
  } catch (err) {
    logger.error(`Errore nel generare report annuale: ${err.message}`);
    return {};
  }
}

export function closeDatabase() {
  if (db) {
    db.close();
  }
}
