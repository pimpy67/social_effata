import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";
import { getRomeParts } from "./monthlySummary.js";
import { buildCategoryInfoSlide, buildStoryImage, padWithBlur } from "./photoOptimizer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "..", "output");
// Foto della raccolta "Ruote di Speranza": assets/ruote-di-speranza/1.jpg..N.jpg
// (scaricate dalla pagina GoFundMe l'08/09/2026 — vanno riscaricate a mano se
// cambiano). Se la cartella è vuota, la promo ripiega sulla sola slide.
const PHOTOS_DIR = path.join(__dirname, "..", "assets", "ruote-di-speranza");
const STATE_FILE = path.join(__dirname, "..", "gofundme-promo-state.json");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// 2 uscite a settimana, sfasate di 1 giorno rispetto al calendario solidale
// (martedì/venerdì): mercoledì e sabato dalle 18 (ora italiana).
const PROMO_WEEKDAYS = new Set([3, 6]); // 0=domenica ... 3=mercoledì, 6=sabato
const TRIGGER_HOUR = 18;

// Link della raccolta: appeso in fondo ai testi generati, non passa da Claude.
const GOFUNDME_LINK = "https://www.gofundme.com/f/ruote-di-speranza";

// Colore di sfondo della slide di chiusura: un petrolio/teal, diverso dal rosso
// brand usato dalla promo del calendario, per distinguere a colpo d'occhio le due
// campagne. Modificabile qui se Andrea vuole un'altra tinta.
const SLIDE_BG = "#1b6b7a";

const SYSTEM_PROMPT = `Sei il social media manager di Effatà Italia, una ODV (Organizzazione Di Volontariato) attiva in Uganda a sostegno della Casa Famiglia e di programmi di aiuto sanitario.

Devi scrivere un post social che promuove la raccolta fondi "RUOTE DI SPERANZA – un pulmino per l'Uganda" (Wheels of Hope). Fatti da usare (non inventarne altri):
- L'obiettivo è comprare un pulmino da 12-15 posti per portare i pazienti dai villaggi agli ospedali in Uganda.
- Oggi si usano taxi privati e si riescono ad accompagnare solo 1-2 pazienti a settimana: ogni settimana c'è una scelta dolorosa su chi portare e chi lasciare a casa.
- Con un pulmino si potrebbe raddoppiare il numero di persone raggiunte, arrivare anche ad anziani e persone con disabilità, e organizzare screening diagnostici nei villaggi lontani.
- Obiettivo della raccolta: 4.500 euro.
- Storia di Hassan: un bambino di 6 anni con una grave deformità al piede, vive a 80 km dall'ospedale CoRSU di Kisubi; per una famiglia che vive con meno di 2 dollari al giorno quella distanza è una barriera insormontabile.

Scrivi il post in due versioni:
1. facebook: caldo e discorsivo, 2-3 paragrafi brevi, taglio storytelling. Chiudi con una call-to-action chiara verso la raccolta. Qualche hashtag pertinente alla fine.
2. instagram: poche righe di impatto, cita l'obiettivo (4.500€) e una CTA diretta. Qualche hashtag.

Regole ferme:
- Questa è una raccolta fondi su GoFundMe: NON è detraibile fiscalmente. NON scrivere mai di "detrazione", "35%", "importo netto".
- L'unica volontaria e fondatrice è Silvia, sul campo in Uganda. NON scrivere mai "i nostri volontari"/"le nostre volontarie"/"il nostro team di volontari" al plurale; i collaboratori ugandesi si chiamano "collaboratori"/"team ugandese", mai "volontari".
- Non inventare cifre, scadenze, percentuali di raccolta raggiunta, numeri di telefono, email o handle social.
- NON scrivere nessun link o URL nel testo: il link della raccolta viene aggiunto automaticamente in fondo. Chiudi con una CTA che rimandi a quel link ("dona al link qui sotto", "trovi la raccolta al link", "link in bio").
- Un tono di urgenza è ammesso (è una raccolta con un obiettivo), ma niente pietismo gratuito né dettagli morbosi.

Restituisci le due versioni chiamando lo strumento "emit_gofundme_promo".`;

const PROMO_TOOL = {
  name: "emit_gofundme_promo",
  description: "Pubblica il post promozionale della raccolta Ruote di Speranza nelle due versioni Facebook e Instagram.",
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
const ANGLES = [
  "Taglio: la scelta impossibile di ogni settimana — con un solo taxi si porta in ospedale 1-2 persone e si è costretti a decidere chi lasciare a casa.",
  "Taglio: la storia di Hassan, 6 anni, deformità al piede, 80 km dall'ospedale CoRSU: una distanza che la sua famiglia non può percorrere.",
  "Taglio: cosa cambierebbe con il pulmino — raddoppiare le persone raggiunte, arrivare ad anziani e persone con disabilità, portare gli screening nei villaggi.",
  "Taglio: 'un posto sul pulmino' come gesto concreto — non un mezzo qualsiasi, ma il viaggio verso le cure per chi vive lontano da tutto.",
  "Taglio: chi oggi resta tagliato fuori — anziani e persone con disabilità che non riescono a raggiungere un ospedale senza un mezzo adatto.",
  "Taglio: obiettivo 4.500€ per un pulmino da 12-15 posti — un traguardo raggiungibile se in tanti danno un piccolo contributo.",
];

// Testo della slide di chiusura (STORIA, 1080x1920). Righe già a capo a mano
// (max ~22 caratteri), "\n\n" = spazio doppio tra blocchi. Nessuna emoji.
const STORY_TEXTS = [
  "RUOTE DI SPERANZA\nUN PULMINO PER\nL'UGANDA\n\nOggi solo taxi:\n1-2 pazienti\na settimana\n\nCon un pulmino\n12-15 posti\nnon lasci indietro\nnessuno\n\nObiettivo 4.500€\nDona: link in bio",
  "AIUTACI A COMPRARE\nUN PULMINO\n\nPorta bambini\ncome Hassan\nall'ospedale\n\n80 km che una\nfamiglia povera\nnon può percorrere\n\nObiettivo 4.500€\nIl link è in bio",
  "OGNI SETTIMANA\nUNA SCELTA\nDIFFICILE\n\nChi porto in\nospedale oggi\ne chi resta a casa?\n\nCon un pulmino\nnon scegliamo\npiù chi aiutare\n\nObiettivo 4.500€\nSostieni: link in bio",
  "UN POSTO SUL\nPULMINO\n\nÈ il viaggio\nverso le cure\nper chi vive\nlontano dall'ospedale\n\nAiutaci a\nraggiungere\ni 4.500€\n\nDona al link in bio",
];

// Testo della slide per il POST nel feed (1080x1350): usato solo come fallback se
// mancano le foto. Più corto.
const POST_TEXTS = [
  "RUOTE DI SPERANZA\nUN PULMINO PER\nL'UGANDA\n\nObiettivo 4.500€\nDona: link in bio",
  "UN PULMINO PER\nPORTARE I PAZIENTI\nALL'OSPEDALE\n\nObiettivo 4.500€\nLink in bio",
];

export function slotIndex(dateKey) {
  return Math.floor(Date.parse(`${dateKey}T00:00:00Z`) / 86400000);
}

// Contatore di rotazione che avanza di ~1 a ogni uscita: mercoledì e sabato
// distano 3 giorni, dividere per 3 fa scorrere in ordine tutte le varianti.
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

function weekdayOf({ year, month, day }) {
  return new Date(year, month - 1, day).getDay();
}

// "YYYY-MM-DD" del giorno per cui va pubblicata ORA la promo, o null. Si attiva
// mercoledì e sabato dalle 18 (ora italiana) — soglia ">= 18" così un riavvio
// serale non salta la finestra — e salta se quel giorno è già stato fatto.
export function dueGofundmePromo(now = new Date(), lastRunDate = null) {
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
    logger.warn(`Errore nel leggere lo stato della promo Ruote di Speranza: ${err.message}`);
  }
  return {};
}

function writeState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    logger.warn(`Errore nel salvare lo stato della promo Ruote di Speranza: ${err.message}`);
  }
}

function withGofundmeLink(text) {
  return `${text.trim()}\n\n👉 ${GOFUNDME_LINK}`;
}

// Elenco ordinato delle foto disponibili (assets/ruote-di-speranza/*.jpg).
function listPhotos() {
  try {
    return fs
      .readdirSync(PHOTOS_DIR)
      .filter((f) => /\.(jpe?g|png)$/i.test(f))
      .sort()
      .map((f) => path.join(PHOTOS_DIR, f));
  } catch {
    return [];
  }
}

// Foto da usare per questa uscita: ne ruota una diversa a ogni pubblicazione.
function photoBufferFor(dateKey) {
  const photos = listPhotos();
  if (photos.length === 0) return null;
  const file = photos[rotation(dateKey) % photos.length];
  try {
    return fs.readFileSync(file);
  } catch (err) {
    logger.warn(`Promo Ruote di Speranza: foto non leggibile (${file}): ${err.message}`);
    return null;
  }
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
        content: `Scrivi il post della raccolta "Ruote di Speranza" per l'uscita di oggi.\n\n${pickAngle(dateKey)}\n\nNon ripetere formule già viste: rendi questo post riconoscibilmente diverso dai precedenti.`,
      },
    ],
  });

  const toolUse = message.content.find((c) => c.type === "tool_use" && c.name === PROMO_TOOL.name);
  if (!toolUse) {
    throw new Error(`Claude non ha chiamato lo strumento previsto (stop_reason=${message.stop_reason})`);
  }
  return toolUse.input;
}

// Controlla se è il momento (mercoledì/sabato dalle 18, ora italiana) e pubblica.
export async function runGofundmePromoIfDue(bot, metaAPI) {
  const state = readState();
  const dateKey = dueGofundmePromo(new Date(), state.lastRunDate);
  if (!dateKey) return;
  await publishGofundmePromo(bot, metaAPI, dateKey, { scheduled: true });
}

// Pubblicazione manuale immediata (comando /ruote su Telegram): ignora giorno/orario
// e lo stato `lastRunDate` e NON lo aggiorna. Ritorna il riepilogo dei canali.
export async function runGofundmePromoNow(bot, metaAPI) {
  const dateKey = dateKeyOf(getRomeParts(new Date()));
  return publishGofundmePromo(bot, metaAPI, dateKey, { scheduled: false });
}

// Pubblica SUBITO (niente bozza): post nel feed + Storia su Facebook e Instagram.
// Immagine principale = una foto della raccolta (ruotata a ogni uscita); la slide
// petrolio con logo + obiettivo fa da chiusura (2° frame della Storia; fallback per
// il post se non ci sono foto). `scheduled` distingue run automatica da manuale.
async function publishGofundmePromo(bot, metaAPI, dateKey, { scheduled }) {
  const chatId = process.env.ALLOWED_CHAT_ID;
  const retryHint = scheduled ? "Riprovo tra un'ora." : "Riprova col comando /ruote.";

  if (!metaAPI) {
    logger.warn("Promo Ruote di Speranza non pubblicata: Meta API non configurata");
    if (chatId) await bot.sendMessage(chatId, "⚠️ Promo Ruote di Speranza: Meta API non configurata, niente pubblicato.").catch(() => {});
    if (scheduled) writeState({ lastRunDate: dateKey });
    return ["⚠️ Meta API non configurata"];
  }

  let captions;
  try {
    captions = await generateCaptions(dateKey);
  } catch (err) {
    logger.error(`Promo Ruote di Speranza ${dateKey}: errore nella generazione del testo: ${err.message}`);
    if (chatId) await bot.sendMessage(chatId, `⚠️ Promo Ruote di Speranza: errore nella generazione del testo (${err.message}). ${retryHint}`).catch(() => {});
    throw err;
  }

  const facebookText = withGofundmeLink(captions.facebook);
  const instagramText = withGofundmeLink(captions.instagram);

  let postImage;
  let storySlides;
  try {
    const slide = await buildCategoryInfoSlide(pickStoryText(dateKey), { background: SLIDE_BG });
    const photoBuf = photoBufferFor(dateKey);
    if (photoBuf) {
      postImage = await padWithBlur(photoBuf, 1080, 1350);
      storySlides = [await buildStoryImage(photoBuf), slide];
    } else {
      logger.warn(`Promo Ruote di Speranza ${dateKey}: nessuna foto in ${PHOTOS_DIR}, uso solo la slide`);
      postImage = await buildCategoryInfoSlide(pickPostText(dateKey), { width: 1080, height: 1350, background: SLIDE_BG });
      storySlides = [slide];
    }
  } catch (err) {
    logger.error(`Promo Ruote di Speranza ${dateKey}: errore nella creazione delle immagini: ${err.message}`);
    if (chatId) await bot.sendMessage(chatId, `⚠️ Promo Ruote di Speranza: errore nella creazione delle immagini (${err.message}). ${retryHint}`).catch(() => {});
    throw err;
  }

  const timestamp = Date.now();
  try {
    fs.writeFileSync(path.join(OUTPUT_DIR, `${timestamp}_ruote_facebook.txt`), facebookText);
    fs.writeFileSync(path.join(OUTPUT_DIR, `${timestamp}_ruote_instagram.txt`), instagramText);
    fs.writeFileSync(path.join(OUTPUT_DIR, `${timestamp}_ruote_post.jpg`), postImage);
    storySlides.forEach((buf, i) => fs.writeFileSync(path.join(OUTPUT_DIR, `${timestamp}_ruote_story_${i + 1}.jpg`), buf));
  } catch (err) {
    logger.warn(`Promo Ruote di Speranza ${dateKey}: impossibile salvare i file in output/: ${err.message}`);
  }

  const results = [];

  let fbPermalink = null;
  try {
    const fb = await metaAPI.publishToFacebook(facebookText, [postImage]);
    if (fb.success) {
      await metaAPI.publishFacebookDraft(fb.postId);
      results.push("📘 Post Facebook pubblicato");
      try {
        fbPermalink = await metaAPI.getFacebookPostPermalink(fb.postId);
      } catch (err) {
        logger.warn(`Promo Ruote di Speranza ${dateKey}: permalink Facebook non recuperato: ${err.message}`);
      }
    } else {
      results.push(`⚠️ Post Facebook non pubblicato (${fb.error})`);
    }
  } catch (err) {
    logger.error(`Promo Ruote di Speranza ${dateKey}: errore post Facebook: ${err.message}`);
    results.push(`⚠️ Post Facebook non pubblicato (${err.message})`);
  }

  try {
    const ig = await metaAPI.publishToInstagram(instagramText, [postImage]);
    results.push(ig.success ? "📷 Post Instagram pubblicato" : `⚠️ Post Instagram non pubblicato (${ig.error})`);
  } catch (err) {
    logger.error(`Promo Ruote di Speranza ${dateKey}: errore post Instagram: ${err.message}`);
    results.push(`⚠️ Post Instagram non pubblicato (${err.message})`);
  }

  try {
    const fbStory = await metaAPI.publishFacebookStory(storySlides);
    results.push(fbStory.success ? "📘 Storia Facebook pubblicata" : `⚠️ Storia Facebook non pubblicata (${fbStory.error})`);
  } catch (err) {
    logger.error(`Promo Ruote di Speranza ${dateKey}: errore Storia Facebook: ${err.message}`);
    results.push(`⚠️ Storia Facebook non pubblicata (${err.message})`);
  }

  try {
    const igStory = await metaAPI.publishInstagramStory(storySlides);
    results.push(igStory.success ? "📷 Storia Instagram pubblicata" : `⚠️ Storia Instagram non pubblicata (${igStory.error})`);
  } catch (err) {
    logger.error(`Promo Ruote di Speranza ${dateKey}: errore Storia Instagram: ${err.message}`);
    results.push(`⚠️ Storia Instagram non pubblicata (${err.message})`);
  }

  if (chatId) {
    try {
      const linkLine = fbPermalink ? `\n\n🔗 ${fbPermalink}` : "";
      const head = scheduled ? "🚐 Promo Ruote di Speranza pubblicata" : "🚐 Promo Ruote di Speranza pubblicata a mano";
      await bot.sendPhoto(chatId, postImage, {
        caption: `${head} (${dateKey}).\n\n${results.join("\n")}${linkLine}`,
      });
      await bot.sendMessage(chatId, `📘 Testo Facebook:\n\n${facebookText}`);
      await bot.sendMessage(chatId, `📷 Testo Instagram:\n\n${instagramText}`);
    } catch (err) {
      logger.error(`Promo Ruote di Speranza ${dateKey}: errore nell'invio della notifica Telegram: ${err.message}`);
    }
  }

  if (scheduled) writeState({ lastRunDate: dateKey });
  logger.info(`Promo Ruote di Speranza ${dateKey} pubblicata (${scheduled ? "auto" : "manuale"}): ${results.join(" | ")}`);
  return results;
}
