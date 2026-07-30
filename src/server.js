import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";

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

    logger.info(`API /drafts: ${result.length} bozze trovate`);
    res.json(result);
  } catch (err) {
    logger.error(`Errore nel listare bozze: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// API: Ottenere il contenuto di un file
app.get("/api/drafts/:id/:type", (req, res) => {
  try {
    const { id, type } = req.params;
    const validTypes = ["facebook", "instagram", "linkedin", "blog", "reel"];

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

// API: Listare le foto di una bozza
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
