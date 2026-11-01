// Pagina «Avvento 2026» della dashboard (1/11/2026, Andrea).
// I materiali di ogni giorno stanno in output/avvento/<YYYY-MM-DD>/:
//   scheda.json   testi e informazioni del giorno (vedi esempio in fondo)
//   video.mp4     reel o post del giorno (per Facebook e Instagram)
//   storia.mp4    la storia del giorno
//   copertina.jpg un fotogramma per l'anteprima
//   slide-1.jpg … slide-N.jpg  solo per il carosello
// Lo stato (chi l'ha preso in carico / pubblicato) sta in output/avvento/stato.json.
// Le richieste passano dalla stessa autenticazione della dashboard (/api/).
import fs from "fs";
import path from "path";
import { logger } from "./logger.js";

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const FILE_RE = /^(video\.mp4|storia\.mp4|copertina\.jpg|slide-\d{1,2}\.jpg)$/;
const STATI = ["da_pubblicare", "in_lavorazione", "pubblicato"];

export function registraAvvento(app, outputDir) {
  const dir = path.join(outputDir, "avvento");
  const fileStato = path.join(dir, "stato.json");

  const leggiStato = () => {
    try {
      return JSON.parse(fs.readFileSync(fileStato, "utf-8"));
    } catch {
      return {};
    }
  };

  app.get("/api/avvento", (req, res) => {
    try {
      if (!fs.existsSync(dir)) return res.json([]);
      const stato = leggiStato();
      const giorni = fs
        .readdirSync(dir)
        .filter((d) => DATA_RE.test(d) && fs.existsSync(path.join(dir, d, "scheda.json")))
        .sort()
        .map((d) => {
          const scheda = JSON.parse(fs.readFileSync(path.join(dir, d, "scheda.json"), "utf-8"));
          const presenti = fs.readdirSync(path.join(dir, d)).filter((f) => FILE_RE.test(f));
          const slide = presenti
            .filter((f) => f.startsWith("slide-"))
            .sort((a, b) => parseInt(a.slice(6)) - parseInt(b.slice(6)));
          return {
            ...scheda,
            data: d,
            video: presenti.includes("video.mp4"),
            storia: presenti.includes("storia.mp4"),
            copertina: presenti.includes("copertina.jpg"),
            slide,
            stato: stato[d]?.stato || "da_pubblicare",
            chi: stato[d]?.chi || null,
            quando: stato[d]?.quando || null,
          };
        });
      res.json(giorni);
    } catch (err) {
      logger.error(`Avvento: errore nel leggere i giorni: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });

  // video e immagini; ?scarica=1 forza il download con un nome leggibile
  app.get("/api/avvento/:data/:file", (req, res) => {
    const { data, file } = req.params;
    if (!DATA_RE.test(data) || !FILE_RE.test(file)) {
      return res.status(400).json({ error: "Richiesta non valida" });
    }
    const p = path.join(dir, data, file);
    if (!fs.existsSync(p)) return res.status(404).json({ error: "File non trovato" });
    if (req.query.scarica) {
      return res.download(p, `avvento-${data}-${file}`);
    }
    res.sendFile(p);
  });

  app.patch("/api/avvento/:data/stato", (req, res) => {
    const { data } = req.params;
    const { stato, chi } = req.body || {};
    if (!DATA_RE.test(data) || !STATI.includes(stato)) {
      return res.status(400).json({ error: `Stato non valido. Usa: ${STATI.join(", ")}` });
    }
    try {
      const tutti = leggiStato();
      tutti[data] = { stato, chi: chi || null, quando: new Date().toISOString() };
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fileStato, JSON.stringify(tutti, null, 2));
      logger.info(`Avvento ${data}: ${stato} (${chi || "nessun nome"})`);
      res.json({ success: true, ...tutti[data] });
    } catch (err) {
      logger.error(`Avvento: errore nel salvare lo stato: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  });
}

// Esempio di scheda.json:
// {
//   "titolo": "Finestra 4 · Spazi sereni",
//   "tipo": "reel",                 // reel | post | carosello
//   "facebook": "testo…",
//   "instagram": "testo…",
//   "link_storia": "https://calendario.effataitalia.it/natale?disegno=4&da=ig-storia",
//   "testo_storia": "Finestra 4 · …"
// }
