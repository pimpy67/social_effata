import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";
import { getMonthlyReport, saveDraft } from "./database.js";
import { buildCategoryInfoSlide } from "./photoOptimizer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "..", "output");
// Foto fissa del post di riepilogo: se presente viene usata al posto della slide
// rossa generata (es. la foto di copertina Facebook con Silvia e i bambini).
// Sostituibile a mano quando serve; se il file non c'è si ripiega sulla slide.
const SUMMARY_IMAGE_PATH = path.join(__dirname, "..", "assets", "monthly-summary.jpg");
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

Ti viene fornito l'elenco delle ATTIVITÀ CONCRETE che l'associazione ha realizzato e registrato nel mese appena concluso (bambini iscritti a scuola grazie a un sostegno trovato in Italia, carrozzine donate, casette costruite, materassi consegnati, opere per la casa famiglia, ecc.), suddivise per programma, con i nomi (di battesimo) dei bambini/beneficiari e i nomi delle famiglie quando disponibili.

Scrivi un unico post di RIEPILOGO del mese, in due versioni:
1. facebook: caldo e discorsivo, 2-4 paragrafi brevi. Ringrazia la community per il sostegno e l'attenzione del mese, riassume ciò che è stato REALIZZATO (usa i numeri reali forniti, non arrotondare né inventare), citando i nomi dei bambini/famiglie forniti, e chiude con un invito gentile a continuare a seguire, condividere e sostenere. Alcuni hashtag pertinenti alla fine.
2. instagram: poche righe, di impatto, con i numeri chiave delle attività del mese e una call-to-action diretta.

Regole ferme:
- Il riepilogo racconta ciò che è stato REALIZZATO, NON ciò che è stato pubblicato sui social: non parlare di "storie pubblicate"/"post"/"racconti" e non dare un totale complessivo di storie o contenuti. Cita i numeri per tipo di attività (es. "12 bambini iscritti a scuola", "3 carrozzine donate").
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

// Categorie escluse dal riepilogo delle ATTIVITÀ realizzate: "Vari" (10, solo
// descrittiva) e le due di Volontariato Digitale (11 = invito a condividere, 12 =
// ringraziamento a chi condivide). Non sono aiuti concreti registrati, sono
// contenuti di interazione con la community: non vanno contati né citati nel recap.
const EXCLUDED_FROM_SUMMARY = new Set(["10", "11", "12"]);

// Per ogni categoria "operativa" (id come in CATEGORIES di telegramBot.js), quali
// campi di categoryData riassumere nel digest e con quale etichetta:
//  - names: campi con nomi di persona → si tiene solo il nome di battesimo, senza duplicati
//  - count: campi numerici → si sommano su tutte le attività della categoria
//  - text:  campi liberi (nome famiglia, cosa donato) → si elencano senza duplicati
const CATEGORY_DIGEST_FIELDS = {
  "1": { names: [{ key: "childName", label: "Bambini che ora possono andare a scuola grazie a un sostegno trovato in Italia" }] },
  "1b": { names: [{ key: "childName", label: "Bambini accolti in casa famiglia grazie a un sostegno dall'Italia" }] },
  "2": { names: [{ key: "childName", label: "Bambini operati / seguiti nelle cure" }] },
  "3": { count: [{ key: "wheelchairCount", label: "Carrozzine donate" }], text: [{ key: "childrenNames", label: "Bambini che le hanno ricevute" }] },
  "4": { text: [{ key: "familyName", label: "Famiglie" }] },
  "5": { text: [{ key: "familyName", label: "Famiglie" }] },
  "6": { count: [{ key: "animalCount", label: "Animali donati" }], text: [{ key: "animalSpecies", label: "Tipo di animali" }] },
  "7": { count: [{ key: "mattressCount", label: "Materassi consegnati" }], text: [{ key: "familyName", label: "Famiglie" }] },
  "8": { count: [{ key: "shoeCount", label: "Paia di scarpe donate" }], text: [{ key: "familyName", label: "Famiglie" }] },
  "9": { text: [{ key: "what", label: "Opere realizzate" }] },
};

function firstName(value) {
  const s = String(value || "").trim().split(/\s+/)[0];
  return s && s !== "-" ? s : null;
}

// Righe di una singola attività: nei casi multi-padrino (categoryData.sponsors) ogni
// gruppo è un beneficiario a sé, altrimenti l'attività ha un solo blocco dati.
function detailRows(detail) {
  const d = detail.data || {};
  return Array.isArray(d.sponsors) && d.sponsors.length ? d.sponsors : [d];
}

// Raggruppa le attività del mese per categoria, escluse quelle non "operative".
function activitiesByCategory(details) {
  const byCategory = new Map();
  for (const detail of details || []) {
    const num = String(detail.categoryNumber);
    if (EXCLUDED_FROM_SUMMARY.has(num)) continue;
    if (!byCategory.has(num)) byCategory.set(num, { name: detail.category, items: [] });
    byCategory.get(num).items.push(detail);
  }
  return byCategory;
}

// Nomi di battesimo distinti raccolti in un campo `names` della configurazione, su
// tutte le righe di una categoria.
function collectNames(rows, fields) {
  const names = [];
  for (const f of fields || []) {
    for (const r of rows) {
      const n = firstName(r[f.key]);
      if (n && !names.includes(n)) names.push(n);
    }
  }
  return names;
}

// Somma dei campi numerici `count` della configurazione, su tutte le righe.
function sumCounts(rows, fields) {
  let sum = 0;
  for (const f of fields || []) {
    for (const r of rows) {
      const n = parseInt(r[f.key], 10);
      if (!Number.isNaN(n)) sum += n;
    }
  }
  return sum;
}

// Numero "principale" di una categoria, quello che rappresenta l'aiuto realizzato:
//  - categorie con nomi (adozioni, cure): quanti bambini distinti
//  - categorie con un conteggio (carrozzine, materassi, scarpe, animali): la somma
//  - le altre (casette, opere casa famiglia, terreni): quante attività registrate
function categoryPrimaryCount({ num, rows, itemCount }) {
  const cfg = CATEGORY_DIGEST_FIELDS[num] || {};
  const names = collectNames(rows, cfg.names);
  if (names.length) return names.length;
  const sum = sumCounts(rows, cfg.count);
  if (sum > 0) return sum;
  return itemCount;
}

// Numero complessivo di aiuti concreti del mese: somma dei numeri "principali" di
// ogni categoria operativa (esclusi Vari e Volontariato Digitale). Usato solo per la
// notifica interna su Telegram e per il controllo "mese vuoto".
export function summaryActivityCount(report) {
  let n = 0;
  for (const [num, { items }] of activitiesByCategory(report.details)) {
    n += categoryPrimaryCount({ num, rows: items.flatMap(detailRows), itemCount: items.length });
  }
  return n;
}

// Testo dell'immagine-slide di fallback (riusa buildCategoryInfoSlide): solo mese e
// una frase di gratitudine, nessun numero — il dettaglio vive nella didascalia.
// Usato solo se in assets/ non c'è una foto fissa del riepilogo.
export function buildSummaryImageText(report) {
  const mese = (report.monthName || "").toUpperCase();
  return `IL MESE DI\n${mese}\n\nGrazie a chi\ncammina con noi`;
}

// Riepilogo testuale delle ATTIVITÀ realizzate nel mese, passato a Claude come base
// per la didascalia. Volutamente NON contiene un totale di storie/post: elenca solo
// le cose fatte, per programma, con i nomi salvati nel database.
export function buildReportDigest(report) {
  const lines = [
    `Mese: ${report.monthName}`,
    "",
    "Attività concrete realizzate e registrate nel mese (usa SOLO questi dati, non aggiungerne altri):",
  ];

  for (const [num, { name, items }] of activitiesByCategory(report.details)) {
    const cfg = CATEGORY_DIGEST_FIELDS[num] || {};
    const rows = items.flatMap(detailRows);
    const primary = categoryPrimaryCount({ num, rows, itemCount: items.length });
    lines.push("", `${name}: ${primary}`);

    const names = collectNames(rows, cfg.names);
    if (names.length && cfg.names?.[0]) {
      lines.push(`  ${cfg.names[0].label}: ${names.join(", ")}`);
    }
    for (const f of cfg.count || []) {
      const sum = sumCounts(rows, [f]);
      if (sum > 0 && sum !== primary) lines.push(`  ${f.label}: ${sum}`);
    }
    for (const f of cfg.text || []) {
      const vals = [];
      for (const r of rows) {
        const v = String(r[f.key] || "").trim();
        if (v && v !== "-" && !vals.includes(v)) vals.push(v);
      }
      if (vals.length) lines.push(`  ${f.label}: ${vals.join("; ")}`);
    }
  }

  return lines.join("\n");
}

// Immagine del post di riepilogo: se in assets/ c'è una foto fissa
// (monthly-summary.jpg) usa quella, ridimensionata al box verticale 4:5 dei social
// senza ritaglio; altrimenti ripiega sulla slide rossa generata con mese + numero
// di aiuti. La foto fissa si sostituisce a mano quando se ne vuole una diversa.
export async function buildSummaryImage(report) {
  if (fs.existsSync(SUMMARY_IMAGE_PATH)) {
    try {
      return await sharp(SUMMARY_IMAGE_PATH)
        .resize(1080, 1350, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 90, progressive: true })
        .toBuffer();
    } catch (err) {
      logger.warn(`Riepilogo mensile: foto fissa non usabile (${err.message}), uso la slide generata`);
    }
  }
  return buildCategoryInfoSlide(buildSummaryImageText(report));
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

  const activityCount = summaryActivityCount(report);
  if (!report.monthName || activityCount === 0) {
    await bot.sendMessage(
      chatId,
      `📊 Riepilogo mensile: nessuna attività registrata nel mese di ${report.monthName || monthKey}, nessun post creato.`
    );
    writeState({ lastRunMonth: monthKey });
    logger.info(`Riepilogo mensile ${monthKey}: nessuna attività, nessun post`);
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
    image = await buildSummaryImage(report);
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
      caption: `📊 Riepilogo di ${report.monthName} pronto (${activityCount} attività realizzate).\n\n${fbNote}\n\n📷 Per Instagram: usa questa immagine + la didascalia nel messaggio qui sotto.`,
    });
    await bot.sendMessage(chatId, `📷 Didascalia Instagram (tieni premuto per copiare):\n\n${captions.instagram}`);
    await bot.sendMessage(chatId, `📘 Testo Facebook (già nella bozza, qui per riferimento):\n\n${captions.facebook}`);
  } catch (err) {
    logger.error(`Riepilogo mensile ${monthKey}: errore nell'invio della notifica Telegram: ${err.message}`);
  }

  writeState({ lastRunMonth: monthKey });
  logger.info(`Riepilogo mensile ${monthKey} preparato: bozza=${facebookPostId ? "sì" : "no"}, attività realizzate=${activityCount}`);
}
