import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";
import { getMonthlyReport, saveDraft } from "./database.js";
import { buildCategoryInfoSlide } from "./photoOptimizer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "..", "output");
// Ricorda l'ultimo mese per cui il riepilogo social è già stato preparato, per non
// rigenerarlo ogni ora (il controllo gira allo stesso intervallo del report interno).
const STATE_FILE = path.join(__dirname, "..", "monthly-summary-state.json");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// L'utente vuole il post "a fine mese alle 21": si intende l'ora italiana, non
// l'UTC del server. Si legge giorno/ora nel fuso di Roma.
const TIMEZONE = "Europe/Rome";
const TRIGGER_HOUR = 21;

// Voce Effatà condensata dal prompt di generateContent.js: qui serve solo per un
// recap mensile di gratitudine, non per raccontare una singola storia.
const SYSTEM_PROMPT = `Sei il social media manager di Effatà Italia, una ODV (Organizzazione Di Volontariato) attiva in Uganda con diversi programmi: adozioni scolastiche a distanza, aiuti sanitari (operazioni, carrozzine), costruzione di casette, sostegno a terreni agricoli, animali domestici, materassi, scarpe, opere per la casa famiglia e altri progetti di aiuto.

Ti vengono forniti i numeri delle storie che l'associazione ha condiviso sui social nel mese appena concluso, suddivise per programma, con i nomi (di battesimo) dei bambini/beneficiari quando disponibili.

Scrivi un unico post di RIEPILOGO del mese, in due versioni:
1. facebook: caldo e discorsivo, 2-4 paragrafi brevi. Ringrazia la community per il sostegno e l'attenzione del mese, riassume cosa è stato fatto (usa i numeri reali forniti, non arrotondare né inventare), e chiude con un invito gentile a continuare a seguire, condividere e sostenere. Alcuni hashtag pertinenti alla fine.
2. instagram: poche righe, di impatto, con i numeri chiave del mese e una call-to-action diretta.

Regole ferme:
- Effatà NON è una ONG e NON si occupa solo di adozioni scolastiche: se il mese tocca più programmi, nominali, non ridurre tutto alle adozioni.
- L'unica volontaria e fondatrice è Silvia, sul campo in Uganda. NON scrivere mai "i nostri volontari"/"le nostre volontarie"/"il nostro team di volontari" al plurale. Il lavoro sul campo è svolto anche da collaboratori ugandesi ("collaboratori"/"team ugandese", mai "volontari").
- Non inventare dettagli, cifre o storie non presenti nei dati forniti. Se un dato manca, resta generico.
- Se citi il sito, usa esclusivamente "https://effataitalia.it" (con protocollo).
- Nessun pietismo, nessun dettaglio identificativo oltre ai nomi di battesimo forniti.
- Tono di gratitudine e di comunità, non di emergenza.

Restituisci le due versioni chiamando lo strumento "emit_monthly_summary".`;

const SUMMARY_TOOL = {
  name: "emit_monthly_summary",
  description: "Pubblica il post di riepilogo mensile nelle due versioni Facebook e Instagram.",
  input_schema: {
    type: "object",
    properties: {
      facebook: { type: "string" },
      instagram: { type: "string" },
    },
    required: ["facebook", "instagram"],
  },
};

// Giorno/ora correnti nel fuso di Roma, come numeri.
export function getRomeParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  })
    .formatToParts(date)
    .reduce((acc, p) => {
      if (p.type !== "literal") acc[p.type] = parseInt(p.value, 10);
      return acc;
    }, {});
  // "24" a mezzanotte in alcuni runtime: normalizzalo a 0.
  if (parts.hour === 24) parts.hour = 0;
  return parts;
}

function isLastDayOfMonth({ year, month, day }) {
  // new Date(year, month, 0) con month 1-based = ultimo giorno del mese `month`.
  return day === new Date(year, month, 0).getDate();
}

export function monthKeyOf({ year, month }) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

// Ritorna la chiave "YYYY-MM" del mese di cui va preparato ora il riepilogo, o
// null se non è il momento. Si attiva:
//  - l'ultimo giorno del mese dalle 21 in poi (ora italiana) → riepiloga il mese
//    che si sta chiudendo. Soglia ">= 21" (non "== 21") così un riavvio serale non
//    salta la finestra;
//  - come recupero, il 1° del mese a qualsiasi ora (bot spento ieri sera) →
//    riepiloga il mese precedente.
// In entrambi i casi salta se quel mese è già stato preparato (lastRunMonth).
export function dueSummaryMonth(now = new Date(), lastRunMonth = null) {
  const parts = getRomeParts(now);
  let target = null;

  if (isLastDayOfMonth(parts) && parts.hour >= TRIGGER_HOUR) {
    target = monthKeyOf(parts);
  } else if (parts.day === 1) {
    const prev = new Date(parts.year, parts.month - 1, 0);
    target = monthKeyOf({ year: prev.getFullYear(), month: prev.getMonth() + 1 });
  }

  if (!target || target === lastRunMonth) return null;
  return target;
}

function readState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch (err) {
    logger.warn(`Errore nel leggere lo stato del riepilogo mensile: ${err.message}`);
  }
  return {};
}

function writeState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    logger.warn(`Errore nel salvare lo stato del riepilogo mensile: ${err.message}`);
  }
}

// Prima parola (nome di battesimo) di ogni campo childName presente nei dettagli,
// senza duplicati e nell'ordine di pubblicazione. I cognomi non sono nei dati.
function beneficiaryNames(details) {
  const names = [];
  for (const d of details || []) {
    const groups = Array.isArray(d.data?.sponsors) && d.data.sponsors.length ? d.data.sponsors : [d.data || {}];
    for (const g of groups) {
      const first = (g.childName || "").trim().split(/\s+/)[0];
      if (first && !names.includes(first)) names.push(first);
    }
  }
  return names;
}

// Testo che va dentro l'immagine-slide (riusa buildCategoryInfoSlide): volutamente
// minimale — solo mese e totale — così sta sempre dentro l'altezza della slide a
// prescindere da quante categorie ha toccato il mese. Il dettaglio per categoria
// vive nella didascalia, non nell'immagine.
export function buildSummaryImageText(report) {
  const mese = (report.monthName || "").toUpperCase();
  const n = report.total || 0;
  const storie = n === 1 ? "storia di aiuto raccontata" : "storie di aiuto raccontate";
  return `IL MESE DI\n${mese}\n\n${n} ${storie}\n\nGrazie a chi cammina con noi`;
}

// Riepilogo testuale dei numeri, passato a Claude come base per la didascalia.
export function buildReportDigest(report) {
  const lines = [`Mese: ${report.monthName}`, `Totale storie pubblicate: ${report.total}`, "", "Per programma:"];
  for (const [category, count] of Object.entries(report.report || {})) {
    lines.push(`- ${category}: ${count}`);
  }
  const names = beneficiaryNames(report.details);
  if (names.length) {
    lines.push("", `Nomi di battesimo dei bambini/beneficiari raccontati nel mese: ${names.join(", ")}.`);
  }
  return lines.join("\n");
}

async function generateCaptions(report) {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    tools: [SUMMARY_TOOL],
    tool_choice: { type: "tool", name: SUMMARY_TOOL.name },
    messages: [{ role: "user", content: buildReportDigest(report) }],
  });

  const toolUse = message.content.find((c) => c.type === "tool_use" && c.name === SUMMARY_TOOL.name);
  if (!toolUse) {
    throw new Error(`Claude non ha chiamato lo strumento previsto (stop_reason=${message.stop_reason})`);
  }
  return toolUse.input;
}

// Controlla se è il momento del riepilogo mensile e, se sì, lo prepara: didascalia
// generata da Claude + immagine riepilogo, bozza Facebook non pubblica (finisce in
// /bozze) e notifica Telegram con immagine e testo pronti anche per Instagram.
// bot = istanza node-telegram-bot-api; metaAPI può essere null (in quel caso si
// salta la bozza FB e si manda comunque tutto su Telegram per la pubblicazione a mano).
export async function runMonthlySummaryIfDue(bot, metaAPI) {
  const state = readState();
  const monthKey = dueSummaryMonth(new Date(), state.lastRunMonth);
  if (!monthKey) return;

  const chatId = process.env.ALLOWED_CHAT_ID;
  if (!chatId) {
    logger.warn("Riepilogo mensile non inviato: ALLOWED_CHAT_ID non configurato nel .env");
    return;
  }

  const [year, month] = monthKey.split("-").map(Number);
  const report = getMonthlyReport(year, month);

  if (!report.monthName || report.total === 0) {
    await bot.sendMessage(
      chatId,
      `📊 Riepilogo mensile: nessuna storia pubblicata nel mese di ${report.monthName || monthKey}, nessun post creato.`
    );
    writeState({ lastRunMonth: monthKey });
    logger.info(`Riepilogo mensile ${monthKey}: mese vuoto, nessun post`);
    return;
  }

  let captions;
  try {
    captions = await generateCaptions(report);
  } catch (err) {
    logger.error(`Riepilogo mensile ${monthKey}: errore nella generazione della didascalia: ${err.message}`);
    await bot.sendMessage(chatId, `⚠️ Riepilogo di ${report.monthName}: errore nella generazione del testo (${err.message}). Riproverò tra un'ora.`);
    return; // stato non aggiornato: nuovo tentativo al prossimo giro
  }

  let image;
  try {
    image = await buildCategoryInfoSlide(buildSummaryImageText(report));
  } catch (err) {
    logger.error(`Riepilogo mensile ${monthKey}: errore nella creazione dell'immagine: ${err.message}`);
    await bot.sendMessage(chatId, `⚠️ Riepilogo di ${report.monthName}: errore nella creazione dell'immagine (${err.message}). Riproverò tra un'ora.`);
    return;
  }

  const timestamp = Date.now();
  const outBase = path.join(OUTPUT_DIR, `${timestamp}`);
  try {
    fs.writeFileSync(`${outBase}_facebook.txt`, captions.facebook);
    fs.writeFileSync(`${outBase}_instagram.txt`, captions.instagram);
    fs.writeFileSync(`${outBase}_summary.jpg`, image);
  } catch (err) {
    logger.warn(`Riepilogo mensile ${monthKey}: impossibile salvare i file in output/: ${err.message}`);
  }

  let facebookPostId = null;
  let fbNote;
  if (metaAPI) {
    try {
      const fb = await metaAPI.publishToFacebook(captions.facebook, [image]);
      if (fb.success) {
        facebookPostId = fb.postId;
        fbNote = "📘 Bozza Facebook creata — rivedila e pubblicala da /bozze.";
      } else {
        fbNote = `⚠️ Bozza Facebook non creata (${fb.error}). Pubblica a mano con l'immagine e il testo qui sotto.`;
      }
    } catch (err) {
      logger.error(`Riepilogo mensile ${monthKey}: errore nella creazione della bozza Facebook: ${err.message}`);
      fbNote = `⚠️ Bozza Facebook non creata (${err.message}). Pubblica a mano con l'immagine e il testo qui sotto.`;
    }
  } else {
    fbNote = "ℹ️ Meta API non configurata: pubblica a mano con l'immagine e il testo qui sotto.";
  }

  saveDraft(
    timestamp,
    1,
    ["facebook", "instagram"],
    captions.facebook.length,
    "Riepilogo mensile",
    null,
    { monthlySummary: true, month: monthKey },
    facebookPostId
  );

  try {
    await bot.sendPhoto(chatId, image, {
      caption: `📊 Riepilogo di ${report.monthName} pronto (${report.total} storie).\n\n${fbNote}\n\n📷 Per Instagram: usa questa immagine + la didascalia nel messaggio qui sotto.`,
    });
    await bot.sendMessage(chatId, `📷 Didascalia Instagram (tieni premuto per copiare):\n\n${captions.instagram}`);
    await bot.sendMessage(chatId, `📘 Testo Facebook (già nella bozza, qui per riferimento):\n\n${captions.facebook}`);
  } catch (err) {
    logger.error(`Riepilogo mensile ${monthKey}: errore nell'invio della notifica Telegram: ${err.message}`);
  }

  writeState({ lastRunMonth: monthKey });
  logger.info(`Riepilogo mensile ${monthKey} preparato: bozza=${facebookPostId ? "sì" : "no"}, totale storie=${report.total}`);
}
