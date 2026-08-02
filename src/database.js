import initSqlJs from "sql.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "effata.db");

export const DRAFT_STATUSES = ["da_pubblicare", "in_lavorazione", "pubblicato"];

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

    // Aggiunte in modo retrocompatibile: i DB creati prima di questa
    // versione non hanno ancora queste colonne.
    ensureColumn("drafts", "status", "TEXT NOT NULL DEFAULT 'da_pubblicare'");
    ensureColumn("drafts", "publishedBy", "TEXT");
    // JSON con i campi opzionali specifici della categoria (es. nome bambino/sostenitore
    // per le adozioni, specie/numero animali per gli animali domestici, ecc.)
    ensureColumn("drafts", "categoryData", "TEXT");

    logger.debug("Tabella 'drafts' creata/verificata");
  } catch (err) {
    logger.error(`Errore nella creazione tabelle: ${err.message}`);
  }
}

function ensureColumn(table, column, definition) {
  const stmt = db.prepare(`PRAGMA table_info(${table})`);
  let exists = false;
  while (stmt.step()) {
    if (stmt.getAsObject().name === column) {
      exists = true;
      break;
    }
  }
  stmt.free();

  if (!exists) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    logger.info(`Colonna '${column}' aggiunta a '${table}'`);
  }
}

export function saveDraft(
  timestamp,
  photoCount,
  formats,
  textLength,
  category = null,
  categoryNumber = null,
  categoryData = null
) {
  try {
    const createdAt = new Date(parseInt(timestamp)).toISOString();
    const formatsJson = JSON.stringify(formats);
    const categoryDataJson =
      categoryData && Object.keys(categoryData).length > 0 ? JSON.stringify(categoryData) : null;

    db.run(
      `INSERT OR REPLACE INTO drafts (timestamp, createdAt, category, categoryNumber, photoCount, formats, textLength, categoryData)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [timestamp, createdAt, category, categoryNumber, photoCount, formatsJson, textLength, categoryDataJson]
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
      SELECT timestamp, createdAt, photoCount, formats, textLength, status, publishedBy
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
        status: row.status,
        publishedBy: row.publishedBy,
      });
    }

    stmt.free();
    return drafts;
  } catch (err) {
    logger.error(`Errore nel recuperare bozze: ${err.message}`);
    return [];
  }
}

// Ritorna stato + volontario per ogni bozza, indicizzati per timestamp
// (come stringa, per essere confrontabili con gli id derivati dai nomi file).
export function getDraftStatuses() {
  try {
    const stmt = db.prepare(`SELECT timestamp, status, publishedBy FROM drafts`);
    const statuses = {};

    while (stmt.step()) {
      const row = stmt.getAsObject();
      statuses[String(row.timestamp)] = {
        status: row.status,
        publishedBy: row.publishedBy,
      };
    }

    stmt.free();
    return statuses;
  } catch (err) {
    logger.error(`Errore nel recuperare stato bozze: ${err.message}`);
    return {};
  }
}

// Aggiorna stato e/o nome del volontario per una bozza esistente.
// Ritorna false se lo stato non è valido o se non esiste nessuna bozza con quel timestamp.
export function updateDraftStatus(timestamp, status, publishedBy = null) {
  if (!DRAFT_STATUSES.includes(status)) {
    logger.warn(`Stato bozza non valido: ${status}`);
    return false;
  }

  try {
    db.run(`UPDATE drafts SET status = ?, publishedBy = ? WHERE timestamp = ?`, [
      status,
      publishedBy,
      timestamp,
    ]);

    const changed = db.getRowsModified() > 0;
    if (changed) {
      saveDatabase();
      logger.info(`Bozza ${timestamp}: stato -> ${status}${publishedBy ? ` (${publishedBy})` : ""}`);
    } else {
      logger.warn(`Aggiornamento stato: nessuna bozza trovata con timestamp=${timestamp}`);
    }
    return changed;
  } catch (err) {
    logger.error(`Errore nell'aggiornare stato bozza: ${err.message}`);
    return false;
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
        status: row.status,
        publishedBy: row.publishedBy,
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

    // La categoria "Vari" (10) è solo descrittiva: esclusa dal conteggio/report.
    const stmt = db.prepare(`
      SELECT category, COUNT(*) as count
      FROM drafts
      WHERE timestamp >= ? AND timestamp < ? AND category IS NOT NULL AND categoryNumber != 10
      GROUP BY category
      ORDER BY category
    `);

    const report = {};
    let total = 0;

    stmt.bind([startTime, endTime]);
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
      details: getCategoryDetailsInRange(startTime, endTime),
    };
  } catch (err) {
    logger.error(`Errore nel generare report mensile: ${err.message}`);
    return {};
  }
}

// Elenco dei campi extra raccolti per categoria (es. nome bambino/sostenitore per le
// adozioni, specie/numero animali per gli animali domestici, ecc.) in un intervallo di
// tempo. La categoria "Vari" (10) è esclusa perché solo descrittiva.
function getCategoryDetailsInRange(startTime, endTime) {
  try {
    const stmt = db.prepare(`
      SELECT category, categoryNumber, createdAt, categoryData
      FROM drafts
      WHERE timestamp >= ? AND timestamp < ? AND categoryNumber IS NOT NULL AND categoryNumber != 10
      ORDER BY timestamp
    `);

    const details = [];
    stmt.bind([startTime, endTime]);
    while (stmt.step()) {
      const row = stmt.getAsObject();
      details.push({
        category: row.category,
        categoryNumber: row.categoryNumber,
        createdAt: row.createdAt,
        data: row.categoryData ? JSON.parse(row.categoryData) : {},
      });
    }

    stmt.free();
    return details;
  } catch (err) {
    logger.error(`Errore nel recuperare i dettagli per categoria: ${err.message}`);
    return [];
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
      WHERE timestamp >= ? AND timestamp < ? AND category IS NOT NULL AND categoryNumber != 10
      GROUP BY category
      ORDER BY category
    `);

    const report = {};
    let total = 0;

    stmt.bind([startTime, endTime]);
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
      details: getCategoryDetailsInRange(startTime, endTime),
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
