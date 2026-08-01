import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ZipArchive } from "archiver";
import { logger } from "./logger.js";
import {
  getAllDrafts,
  queryDrafts,
  getStatistics,
  getMonthlyReport,
  getYearlyReport,
  getDraftStatuses,
  updateDraftStatus,
  DRAFT_STATUSES,
} from "./database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "..", "output");
const PUBLIC_DIR = path.join(__dirname, "..", "public");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(PUBLIC_DIR));
app.use(express.json());

// API: Listare tutte le bozze generate
app.get("/api/drafts", (req, res) => {
  try {
    if (!fs.existsSync(OUTPUT_DIR)) {
      return res.json([]);
    }

    const files = fs.readdirSync(OUTPUT_DIR);
    const drafts = {};

    // Raggruppa i file per timestamp (es. 1704067200000_facebook.txt)
    files.forEach((file) => {
      const match = file.match(/^(\d+)_(.+?)(?:\.\w+)?$/);
      if (match) {
        const [, timestamp, type, ext] = match;
        if (!drafts[timestamp]) {
          drafts[timestamp] = {
            id: timestamp,
            createdAt: new Date(parseInt(timestamp)).toISOString(),
            files: {},
          };
        }
        drafts[timestamp].files[type] = file;
      }
    });

    // Converti in array e ordina per data decrescente
    const result = Object.values(drafts).sort(
      (a, b) => parseInt(b.id) - parseInt(a.id)
    );

    // Arricchisce ogni bozza con stato e volontario dal database
    const statuses = getDraftStatuses();
    result.forEach((draft) => {
      const info = statuses[draft.id];
      draft.status = info?.status || "da_pubblicare";
      draft.publishedBy = info?.publishedBy || null;
    });

    logger.info(`API /drafts: ${result.length} bozze trovate`);
    res.json(result);
  } catch (err) {
    logger.error(`Errore nel listare bozze: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// API: Listare le foto di una bozza (DEVE VENIRE PRIMA di /:id/:type)
app.get("/api/drafts/:id/photos", (req, res) => {
  try {
    const { id } = req.params;
    const files = fs.readdirSync(OUTPUT_DIR);

    // Trova tutte le foto associate a questo ID
    const photos = files
      .filter((f) => f.startsWith(id + "_") && /\.(jpg|png|webp|gif)$/i.test(f))
      .sort((a, b) => {
        const numA = parseInt(a.split("_")[1]);
        const numB = parseInt(b.split("_")[1]);
        return numA - numB;
      });

    logger.debug(`API /drafts/${id}/photos: ${photos.length} foto trovate`);
    res.json({ photos });
  } catch (err) {
    logger.error(`Errore nel listare foto: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// API: Scaricare testo e foto di una bozza in un unico zip (DEVE VENIRE PRIMA di /:id/:type)
app.get("/api/drafts/:id/zip", (req, res) => {
  try {
    const { id } = req.params;

    if (!fs.existsSync(OUTPUT_DIR)) {
      return res.status(404).json({ error: "Bozza non trovata" });
    }

    const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.startsWith(id + "_") || f.startsWith(id + "."));

    if (files.length === 0) {
      return res.status(404).json({ error: "Bozza non trovata" });
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="bozza-${id}.zip"`);

    const archive = new ZipArchive({ zlib: { level: 9 } });
    archive.on("error", (err) => {
      logger.error(`Errore nella creazione dello zip per ${id}: ${err.message}`);
      res.destroy();
    });

    archive.pipe(res);

    for (const file of files) {
      archive.file(path.join(OUTPUT_DIR, file), { name: file });
    }

    archive.finalize();
    logger.info(`API /drafts/${id}/zip: ${files.length} file inclusi`);
  } catch (err) {
    logger.error(`Errore nel generare zip: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// API: Ottenere il contenuto di un file (DOPO /photos per evitare conflitti)
app.get("/api/drafts/:id/:type", (req, res) => {
  try {
    const { id, type } = req.params;
    const validTypes = ["facebook", "instagram", "linkedin", "blog", "reel", "youtube"];

    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: "Tipo non valido" });
    }

    const filePath = path.join(OUTPUT_DIR, `${id}_${type}.txt`);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File non trovato" });
    }

    const content = fs.readFileSync(filePath, "utf-8");
    logger.debug(`API /drafts/${id}/${type}: file letto`);
    res.json({ content });
  } catch (err) {
    logger.error(`Errore nel leggere draft: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// API: Aggiornare stato (da_pubblicare / in_lavorazione / pubblicato) e nome del volontario
app.patch("/api/drafts/:id/status", (req, res) => {
  try {
    const { id } = req.params;
    const { status, publishedBy } = req.body;

    if (!DRAFT_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Stato non valido. Usa: ${DRAFT_STATUSES.join(", ")}` });
    }

    const updated = updateDraftStatus(id, status, publishedBy || null);

    if (!updated) {
      return res.status(404).json({ error: "Bozza non trovata nel database" });
    }

    logger.info(`API /drafts/${id}/status: aggiornato a ${status} (${publishedBy || "nessun nome"})`);
    res.json({ success: true, status, publishedBy: publishedBy || null });
  } catch (err) {
    logger.error(`Errore nell'aggiornare stato bozza: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// API: Query database con filtri
app.get("/api/query", (req, res) => {
  try {
    const filters = {};

    if (req.query.daysAgo) {
      filters.daysAgo = parseInt(req.query.daysAgo);
    }

    if (req.query.photoCountMin) {
      filters.photoCountMin = parseInt(req.query.photoCountMin);
    }

    if (req.query.photoCountMax) {
      filters.photoCountMax = parseInt(req.query.photoCountMax);
    }

    if (req.query.channel) {
      filters.channel = req.query.channel;
    }

    const drafts = queryDrafts(filters);
    logger.info(`API /query: ${drafts.length} bozze trovate con filtri`);
    res.json(drafts);
  } catch (err) {
    logger.error(`Errore nella query: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// API: Statistiche database
app.get("/api/statistics", (req, res) => {
  try {
    const stats = getStatistics();
    logger.debug("API /statistics: statistiche recuperate");
    res.json(stats);
  } catch (err) {
    logger.error(`Errore nel recuperare statistiche: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// API: Report mensile
app.get("/api/report/month/:year/:month", (req, res) => {
  try {
    const year = parseInt(req.params.year);
    const month = parseInt(req.params.month);
    const report = getMonthlyReport(year, month);
    res.json(report);
  } catch (err) {
    logger.error(`Errore nel report mensile: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// API: Report annuale
app.get("/api/report/year/:year", (req, res) => {
  try {
    const year = parseInt(req.params.year);
    const report = getYearlyReport(year);
    res.json(report);
  } catch (err) {
    logger.error(`Errore nel report annuale: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Serve foto
app.get("/output/:filename", (req, res) => {
  try {
    const filePath = path.join(OUTPUT_DIR, req.params.filename);

    // Verifica che il percorso richiesto sia dentro output/ (protezione path traversal)
    if (!path.resolve(filePath).startsWith(path.resolve(OUTPUT_DIR))) {
      return res.status(403).json({ error: "Accesso negato" });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File non trovato" });
    }

    res.sendFile(filePath);
  } catch (err) {
    logger.error(`Errore nel servire file: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

export function startServer() {
  return app.listen(PORT, () => {
    logger.info(`Dashboard web avviata su http://localhost:${PORT}`);
  });
}

export { app };
