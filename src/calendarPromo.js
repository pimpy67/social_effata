import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";
import { getRomeParts } from "./monthlySummary.js";
import { buildCategoryInfoSlide, buildStoryImage, padWithBlur } from "./photoOptimizer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "..", "output");
// Immagine per un mese, in ordine di preferenza:
//  1. assets/calendario-mesi-screenshot/YYYY-MM.jpg — screenshot del calendario
//     VERO come si vede su calendario.effataitalia.it (griglia giorni + sfondo del
//     mese + stato adozioni). Generati con scripts/capture-calendar-months.mjs,
//     da rigenerare ogni tanto per aggiornare lo stato delle adozioni.
//  2. assets/calendario-mesi/YYYY-MM.jpg — solo la foto di sfondo del mese (senza
//     griglia). Fallback se manca lo screenshot.
//  3. nessuna delle due → la promo usa solo la slide rossa.
const MONTH_SCREENSHOT_DIR = path.join(__dirname, "..", "assets", "calendario-mesi-screenshot");
const MONTH_IMAGES_DIR = path.join(__dirname, "..", "assets", "calendario-mesi");
// Ricorda l'ultima data (YYYY-MM-DD, ora italiana) per cui la promo è già uscita,
// così un riavvio serale nello stesso giorno non ripubblica. Senza il volume in
// docker-compose.yml un rebuild lo azzera: vedi commento nel compose.
const STATE_FILE = path.join(__dirname, "..", "calendar-promo-state.json");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// L'utente vuole 2 uscite a settimana: martedì e venerdì dalle 18 (ora italiana).
// Come per il riepilogo mensile "ora" = Europe/Rome, non l'UTC del server.
const PROMO_WEEKDAYS = new Set([2, 5]); // 0=domenica ... 2=martedì, 5=venerdì
const TRIGGER_HOUR = 18;

// Link del calendario solidale: appeso meccanicamente in fondo ai testi generati
// (come referenceLink in telegramBot.js), non passa da Claude.
const CALENDAR_LINK = "https://calendario.effataitalia.it/";

const SYSTEM_PROMPT = `Sei il social media manager di Effatà Italia, una ODV (Organizzazione Di Volontariato) che sostiene la Casa Famiglia Effatà in Uganda ("Effatà Children's Home"): una vera casa per bambini dai 0 ai 17 anni orfani, abbandonati, vittime di violenza o con bisogni speciali, a cui offre casa, pasti quotidiani, cure mediche, istruzione e attività creative.

Devi scrivere un post social che promuove il CALENDARIO SOLIDALE 2026/2027 di Effatà (campagna "Regala un Domani") come idea regalo originale. Meccanica dell'iniziativa (usala, non inventarne altra):
- Si "regala" / "adotta" UN GIORNO del calendario con una donazione di 50€.
- Ogni giorno adottato aiuta a garantire cibo, istruzione e cure ai bambini della Casa Famiglia in Uganda.
- La donazione è detraibile al 35%: a chi dona costa realmente solo 32,50€ ("un piccolo gesto che vale il doppio").
- Chi dona riceve una gift card personale da regalare (per un compleanno, un anniversario, una laurea, un battesimo, un matrimonio, Natale, o semplicemente per fare un pensiero diverso dal solito).

DISTINZIONE FONDAMENTALE, non sbagliarla mai:
- Qui si adotta UN GIORNO del calendario, NON un bambino. È un modo per sostenere COLLETTIVAMENTE la Casa Famiglia Effatà.
- NON è l'adozione a distanza personale di un singolo bambino: non scrivere mai "adotta un bambino", "il tuo bambino", "sostieni un bambino a distanza", "cambi il futuro di un bambino", né lasciar intendere un legame uno-a-uno con un minore. Il beneficiario è la Casa Famiglia nel suo insieme.
- Frasi corrette: "adotta un giorno", "regala un giorno", "un giorno per la Casa Famiglia", "sostieni la Casa Famiglia adottando un giorno".

Scrivi il post in due versioni:
1. facebook: caldo e discorsivo, 2-3 paragrafi brevi, taglio "storytelling" sul valore di un regalo che vale il doppio. Chiudi con una call-to-action chiara. Qualche hashtag pertinente alla fine.
2. instagram: poche righe di impatto, con i numeri chiave (50€, -35%, 32,50€) e una CTA diretta. Qualche hashtag.

Regole ferme:
- L'unica volontaria e fondatrice è Silvia, sul campo in Uganda. NON scrivere mai "i nostri volontari"/"le nostre volontarie"/"il nostro team di volontari" al plurale.
- Non inventare cifre, scadenze, numeri di telefono, email o handle social.
- NON scrivere nessun link o URL nel testo (né "effataitalia.it" né altri): il link del calendario viene aggiunto automaticamente in fondo. Chiudi con una call-to-action che rimandi a quel link, con formule tipo "scopri come qui sotto" / "trovi tutto al link".
- Non dire che il calendario è di un anno specifico né citare mesi specifici.
- Tono di gratitudine e di comunità, nessun pietismo, nessuna emergenza.

Restituisci le due versioni chiamando lo strumento "emit_calendar_promo".`;

const PROMO_TOOL = {
  name: "emit_calendar_promo",
  description: "Pubblica il post promozionale del calendario solidale nelle due versioni Facebook e Instagram.",
  input_schema: {
    type: "object",
    properties: {
      facebook: { type: "string" },
      instagram: { type: "string" },
    },
    required: ["facebook", "instagram"],
  },
};

// Angolazioni ruotate a ogni uscita così due post a settimana non si somigliano.
// L'indice è deterministico (giorno del calendario), vedi slotIndex().
const ANGLES = [
  "Taglio: un regalo diverso dal solito, per chi ha già tutto — invece dell'ennesimo oggetto, un giorno del calendario che aiuta davvero.",
  "Taglio: le ricorrenze. Compleanni, lauree, matrimoni, battesimi, anniversari, Natale: lega la festa a un gesto concreto per la Casa Famiglia.",
  "Taglio: il valore concreto per i bambini. Un giorno adottato = cibo, istruzione e cure ai bambini della Casa Famiglia in Uganda.",
  "Taglio: la convenienza. 50€ che con la detrazione del 35% diventano 32,50€, e in cambio ricevi una gift card personale da donare.",
  "Taglio: il legame diretto con la Casa Famiglia e con Silvia — chi adotta un giorno sostiene una realtà precisa, non un progetto astratto.",
  "Taglio: il regalo di gruppo. Colleghi, amici, una classe, una squadra che insieme adottano più giorni o un mese intero del calendario.",
];

// Testo della slide-immagine per la STORIA (1080x1920). Righe già a capo a mano
// (max ~22 caratteri come le altre slide di photoOptimizer), "\n\n" = spazio doppio
// tra blocchi. Nessuna emoji: il font DejaVu in produzione non le disegna.
const STORY_TEXTS = [
  "REGALA UN DOMANI\n\nAdotta un giorno\ndel calendario con 50€\nper la Casa Famiglia\nEffatà in Uganda\n\nDetrazione 35%:\na te costa 32,50€\n\nScrivici in DM o\nvai al link in bio",
  "UN REGALO CHE\nVALE IL DOPPIO\n\nAdotta un giorno\ndel calendario\nsolidale con 50€\n\nCibo, scuola e\ncure ai bambini\ndella Casa Famiglia\n\nCon il 35%: 32,50€",
  "FAI UN REGALO\nDIVERSO\n\nRegala un giorno\ndel calendario:\n50€ per la Casa\nFamiglia in Uganda\n\nRicevi una gift\ncard da donare\n\nDetraibile al 35%",
  "OGNI GIORNO\nADOTTATO CONTA\n\n50€ per un giorno\ndel calendario\nsolidale Effatà\n\nCibo, scuola e\ncure ai bambini\nin Casa Famiglia\n\nA te costa 32,50€",
];

// Testo della slide-immagine per il POST nel feed (1080x1350): più corto della
// Storia, poche righe, o sborda sopra/sotto (il blocco è centrato in verticale).
const POST_TEXTS = [
  "REGALA UN DOMANI\n\nAdotta un giorno\ncon 50€ per la\nCasa Famiglia Effatà\n\nCol 35%: 32,50€",
  "UN REGALO CHE\nVALE IL DOPPIO\n\nUn giorno del\ncalendario: 50€\nsolo 32,50€ netti",
  "ADOTTA UN GIORNO\nDEL CALENDARIO\n\n50€ per i bambini\nin Casa Famiglia\n\nDetraibile al 35%",
  "FAI UN REGALO\nDIVERSO\n\nUn giorno del\ncalendario solidale\n50€, a te 32,50€",
];

// Numero di giorni dall'epoch per una data "YYYY-MM-DD": indice stabile e crescente.
export function slotIndex(dateKey) {
  return Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000);
}

// Contatore di rotazione che avanza di ~1 a ogni uscita: martedì e venerdì distano
// 3 giorni, quindi dividere per 3 fa incrementare l'indice a ogni pubblicazione e
// scorrere in ordine tutte le varianti (con lo slotIndex nudo, mod 4, il martedì
// successivo ripeteva il testo del venerdì).
function rotation(dateKey) {
  return Math.floor(slotIndex(dateKey) / 3);
}

export function pickAngle(dateKey) {
  return ANGLES[rotation(dateKey) % ANGLES.length];
}

export function pickStoryText(dateKey) {
  return STORY_TEXTS[rotation(dateKey) % STORY_TEXTS.length];
}

export function pickPostText(dateKey) {
  return POST_TEXTS[rotation(dateKey) % POST_TEXTS.length];
}

function dateKeyOf({ year, month, day }) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Giorno della settimana (0=domenica) di una data resa come parti di calendario:
// costruita come data "locale" senza orario, quindi nessun problema di fuso.
function weekdayOf({ year, month, day }) {
  return new Date(year, month - 1, day).getDay();
}

// Ritorna la chiave "YYYY-MM-DD" del giorno per cui va pubblicata ORA la promo, o
// null se non è il momento. Si attiva martedì e venerdì dalle 18 (ora italiana) in
// poi — soglia ">= 18" (non "== 18") così un riavvio serale non salta la finestra —
// e salta se quel giorno è già stato fatto (lastRunDate).
export function dueCalendarPromo(now = new Date(), lastRunDate = null) {
  const parts = getRomeParts(now);
  if (!PROMO_WEEKDAYS.has(weekdayOf(parts))) return null;
  if (parts.hour < TRIGGER_HOUR) return null;

  const key = dateKeyOf(parts);
  if (key === lastRunDate) return null;
  return key;
}

function readState() {
  try {
    if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch (err) {
    logger.warn(`Errore nel leggere lo stato della promo calendario: ${err.message}`);
  }
  return {};
}

function writeState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    logger.warn(`Errore nel salvare lo stato della promo calendario: ${err.message}`);
  }
}

// Appende il link del calendario in fondo al testo generato (come referenceLink in
// telegramBot.js): su Facebook diventa cliccabile, su Instagram resta testo.
function withCalendarLink(text) {
  return `${text.trim()}\n\n👉 ${CALENDAR_LINK}`;
}

// Immagine di un mese: prima lo screenshot del calendario vero, poi la sola foto
// di sfondo, altrimenti null. Vedi il commento in cima al file.
function monthImageBuffer(monthKey) {
  for (const dir of [MONTH_SCREENSHOT_DIR, MONTH_IMAGES_DIR]) {
    const file = path.join(dir, `${monthKey}.jpg`);
    try {
      if (fs.existsSync(file)) return fs.readFileSync(file);
    } catch (err) {
      logger.warn(`Promo calendario: immagine del mese non leggibile (${file}): ${err.message}`);
    }
  }
  return null;
}

// Le foto del mese corrente e dei successivi (fino a `n`), per il carosello: es.
// a settembre → [settembre, ottobre, novembre]. Salta i mesi senza foto (fine
// campagna).
function upcomingMonthImages(dateKey, n = 3) {
  const [y, m] = dateKey.slice(0, 7).split("-").map(Number);
  const bufs = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(y, m - 1 + i, 1);
    const buf = monthImageBuffer(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    if (buf) bufs.push(buf);
  }
  return bufs;
}

async function generateCaptions(dateKey) {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    tools: [PROMO_TOOL],
    tool_choice: { type: "tool", name: PROMO_TOOL.name },
    messages: [
      {
        role: "user",
        content: `Scrivi il post del calendario solidale per l'uscita di oggi.\n\n${pickAngle(dateKey)}\n\nNon ripetere formule già viste: rendi questo post riconoscibilmente diverso dai precedenti.`,
      },
    ],
  });

  const toolUse = message.content.find((c) => c.type === "tool_use" && c.name === PROMO_TOOL.name);
  if (!toolUse) {
    throw new Error(`Claude non ha chiamato lo strumento previsto (stop_reason=${message.stop_reason})`);
  }
  return toolUse.input;
}

// Controlla se è il momento (martedì/venerdì dalle 18, ora italiana) e, se sì,
// pubblica. Vedi publishCalendarPromo per cosa viene pubblicato.
export async function runCalendarPromoIfDue(bot, metaAPI) {
  const state = readState();
  const dateKey = dueCalendarPromo(new Date(), state.lastRunDate);
  if (!dateKey) return;
  await publishCalendarPromo(bot, metaAPI, dateKey, { scheduled: true });
}

// Pubblicazione manuale immediata (comando /calendario su Telegram): ignora
// giorno/orario e lo stato `lastRunDate` e NON lo aggiorna, così la pubblicazione
// automatica di martedì/venerdì resta comunque programmata. Ritorna il riepilogo
// testuale dei canali (le stesse righe della notifica Telegram).
export async function runCalendarPromoNow(bot, metaAPI) {
  const dateKey = dateKeyOf(getRomeParts(new Date()));
  return publishCalendarPromo(bot, metaAPI, dateKey, { scheduled: false });
}

// Pubblica SUBITO — scelta esplicita di Andrea, niente bozza: post nel feed +
// Storia su Facebook e Instagram, con testo generato da Claude su un'angolazione a
// rotazione e una slide grafica brand generata al volo. Poi manda una notifica di
// riepilogo su Telegram ad ALLOWED_CHAT_ID (per sapere cosa è uscito), col
// permalink Facebook quando disponibile. `scheduled` distingue la run automatica
// (aggiorna `lastRunDate`) da quella manuale (non lo tocca).
async function publishCalendarPromo(bot, metaAPI, dateKey, { scheduled }) {
  const chatId = process.env.ALLOWED_CHAT_ID;
  const retryHint = scheduled ? "Riprovo tra un'ora." : "Riprova col comando /calendario.";

  if (!metaAPI) {
    logger.warn("Promo calendario non pubblicata: Meta API non configurata");
    if (chatId) await bot.sendMessage(chatId, "⚠️ Promo calendario solidale: Meta API non configurata, niente pubblicato.").catch(() => {});
    if (scheduled) writeState({ lastRunDate: dateKey });
    return ["⚠️ Meta API non configurata"];
  }

  let captions;
  try {
    captions = await generateCaptions(dateKey);
  } catch (err) {
    logger.error(`Promo calendario ${dateKey}: errore nella generazione del testo: ${err.message}`);
    if (chatId) await bot.sendMessage(chatId, `⚠️ Promo calendario solidale: errore nella generazione del testo (${err.message}). ${retryHint}`).catch(() => {});
    throw err; // stato non aggiornato: nuovo tentativo al prossimo giro
  }

  const facebookText = withCalendarLink(captions.facebook);
  const instagramText = withCalendarLink(captions.instagram);

  // Post = CAROSELLO: le foto del mese corrente e dei 2 successivi del calendario
  // (come lo sfondo di calendario.effataitalia.it), poi la slide rossa brand come
  // ultima. La Storia è la stessa sequenza (le Storie non hanno caroselli: sono
  // frame separati). Se non c'è nessuna foto mese → solo la slide rossa.
  let postImages;
  let storySlides;
  try {
    const closingStory = await buildCategoryInfoSlide(pickStoryText(dateKey));
    const months = upcomingMonthImages(dateKey, 3);
    if (months.length) {
      const closingPost = await buildCategoryInfoSlide(pickPostText(dateKey), { width: 1080, height: 1350 });
      postImages = [...(await Promise.all(months.map((b) => padWithBlur(b, 1080, 1350)))), closingPost];
      storySlides = [...(await Promise.all(months.map((b) => buildStoryImage(b)))), closingStory];
    } else {
      logger.warn(`Promo calendario ${dateKey}: nessuna foto per il mese ${dateKey.slice(0, 7)}+, uso solo la slide rossa`);
      postImages = [await buildCategoryInfoSlide(pickPostText(dateKey), { width: 1080, height: 1350 })];
      storySlides = [closingStory];
    }
  } catch (err) {
    logger.error(`Promo calendario ${dateKey}: errore nella creazione delle immagini: ${err.message}`);
    if (chatId) await bot.sendMessage(chatId, `⚠️ Promo calendario solidale: errore nella creazione delle immagini (${err.message}). ${retryHint}`).catch(() => {});
    throw err;
  }

  const timestamp = Date.now();
  try {
    fs.writeFileSync(path.join(OUTPUT_DIR, `${timestamp}_calendar_facebook.txt`), facebookText);
    fs.writeFileSync(path.join(OUTPUT_DIR, `${timestamp}_calendar_instagram.txt`), instagramText);
    postImages.forEach((buf, i) => fs.writeFileSync(path.join(OUTPUT_DIR, `${timestamp}_calendar_post_${i + 1}.jpg`), buf));
    storySlides.forEach((buf, i) => fs.writeFileSync(path.join(OUTPUT_DIR, `${timestamp}_calendar_story_${i + 1}.jpg`), buf));
  } catch (err) {
    logger.warn(`Promo calendario ${dateKey}: impossibile salvare i file in output/: ${err.message}`);
  }

  const results = [];

  // Post Facebook: publishToFacebook crea una bozza non pubblica, publishFacebookDraft
  // la rende subito visibile (e pubblica da sé il commento CTA "CONDIVISO").
  let fbPermalink = null;
  try {
    const fb = await metaAPI.publishToFacebook(facebookText, postImages);
    if (fb.success) {
      await metaAPI.publishFacebookDraft(fb.postId);
      results.push("📘 Post Facebook pubblicato");
      try {
        fbPermalink = await metaAPI.getFacebookPostPermalink(fb.postId);
      } catch (err) {
        logger.warn(`Promo calendario ${dateKey}: permalink Facebook non recuperato: ${err.message}`);
      }
    } else {
      results.push(`⚠️ Post Facebook non pubblicato (${fb.error})`);
    }
  } catch (err) {
    logger.error(`Promo calendario ${dateKey}: errore post Facebook: ${err.message}`);
    results.push(`⚠️ Post Facebook non pubblicato (${err.message})`);
  }

  try {
    const ig = await metaAPI.publishToInstagram(instagramText, postImages);
    results.push(ig.success ? "📷 Post Instagram pubblicato" : `⚠️ Post Instagram non pubblicato (${ig.error})`);
  } catch (err) {
    logger.error(`Promo calendario ${dateKey}: errore post Instagram: ${err.message}`);
    results.push(`⚠️ Post Instagram non pubblicato (${err.message})`);
  }

  try {
    const fbStory = await metaAPI.publishFacebookStory(storySlides);
    results.push(fbStory.success ? "📘 Storia Facebook pubblicata" : `⚠️ Storia Facebook non pubblicata (${fbStory.error})`);
  } catch (err) {
    logger.error(`Promo calendario ${dateKey}: errore Storia Facebook: ${err.message}`);
    results.push(`⚠️ Storia Facebook non pubblicata (${err.message})`);
  }

  try {
    const igStory = await metaAPI.publishInstagramStory(storySlides);
    results.push(igStory.success ? "📷 Storia Instagram pubblicata" : `⚠️ Storia Instagram non pubblicata (${igStory.error})`);
  } catch (err) {
    logger.error(`Promo calendario ${dateKey}: errore Storia Instagram: ${err.message}`);
    results.push(`⚠️ Storia Instagram non pubblicata (${err.message})`);
  }

  if (chatId) {
    try {
      const linkLine = fbPermalink ? `\n\n🔗 ${fbPermalink}` : "";
      const head = scheduled ? "🎁 Promo calendario solidale pubblicata" : "🎁 Promo calendario solidale pubblicata a mano";
      await bot.sendPhoto(chatId, postImages[0], {
        caption: `${head} (${dateKey}) — carosello di ${postImages.length} immagini.\n\n${results.join("\n")}${linkLine}`,
      });
      await bot.sendMessage(chatId, `📘 Testo Facebook:\n\n${facebookText}`);
      await bot.sendMessage(chatId, `📷 Testo Instagram:\n\n${instagramText}`);
    } catch (err) {
      logger.error(`Promo calendario ${dateKey}: errore nell'invio della notifica Telegram: ${err.message}`);
    }
  }

  if (scheduled) writeState({ lastRunDate: dateKey });
  logger.info(`Promo calendario ${dateKey} pubblicata (${scheduled ? "auto" : "manuale"}): ${results.join(" | ")}`);
  return results;
}
