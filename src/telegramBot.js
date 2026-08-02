import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { generateSocialContent } from "./generateContent.js";
import { logger } from "./logger.js";
import { validation } from "./validation.js";
import { initMetaAPI } from "./metaAPI.js";
import { optimizePhotosForSocial } from "./photoOptimizer.js";
import { saveDraft, getMonthlyReport, getYearlyReport } from "./database.js";

// Categorie disponibili
const CATEGORIES = {
  "1": "Adozioni scolastiche",
  "2": "Aiuti sanitari (Operazioni)",
  "3": "Aiuti sanitari (Carozzine)",
  "4": "Costruzione casette",
  "5": "Affitto terreni agricoli",
  "6": "Animali domestici",
  "7": "Materassi",
  "8": "Scarpe",
  "9": "Casafamiglia (opere)",
  "10": "Vari",
};

// Frasi/link fissi da includere sempre nei testi di una specifica categoria (opzionale, per id)
const CATEGORY_RULES = {
  "1": "Includi sempre il link effataitalia.it/adozioni.",
  "2": "",
  "3": "",
  "4": "",
  "5": "",
  "6": "",
  "7": "",
  "8": "",
  "9": "",
  "10": "",
};

// Categoria selezionata per ogni chat
const selectedCategory = new Map();

// Per ogni categoria (tranne "Vari", solo descrittiva), il bot chiede in sequenza
// alcuni campi opzionali specifici (scrivi "-" per saltare un campo). Le risposte
// vengono salvate nel database e mostrate nel dettaglio dei report mensili/annuali.
const CATEGORY_STEPS = {
  "1": [
    { key: "childName", label: "Bambino/a", question: "👶 Nome del bambino/a adottato/a? (scrivi - per saltare)" },
    { key: "sponsorName", label: "Sostenitore", question: "🙏 Nome del sostenitore/padrino/madrina? (scrivi - per saltare)" },
    { key: "sponsorProvince", label: "Provincia", question: "📍 Provincia del sostenitore/padrino/madrina? (scrivi - per saltare)" },
  ],
  "2": [
    { key: "childName", label: "Bambino/a", question: "👶 Nome del bambino/a? (scrivi - per saltare)" },
    { key: "sponsorName", label: "Sostenitore", question: "🙏 Nome del sostenitore? (scrivi - per saltare)" },
    { key: "sponsorProvince", label: "Provincia", question: "📍 Provincia del sostenitore? (scrivi - per saltare)" },
  ],
  "3": [
    { key: "childrenNames", label: "Bambini coinvolti", question: "👶 Nomi dei bambini coinvolti? (scrivi - per saltare)" },
    { key: "wheelchairCount", label: "Carrozzine donate", question: "🦽 Numero di carrozzine donate? (scrivi - per saltare)" },
  ],
  "4": [
    { key: "familyName", label: "Famiglia", question: "🏠 Nome della famiglia? (scrivi - per saltare)" },
    { key: "sponsorName", label: "Sostenitore", question: "🙏 Nome del sostenitore? (scrivi - per saltare)" },
    { key: "sponsorProvince", label: "Provincia", question: "📍 Provincia del sostenitore? (scrivi - per saltare)" },
  ],
  "5": [
    { key: "familyName", label: "Famiglia", question: "🏠 Nome della famiglia? (scrivi - per saltare)" },
    { key: "sponsorName", label: "Sostenitore", question: "🙏 Nome del sostenitore? (scrivi - per saltare)" },
  ],
  "6": [
    { key: "sponsorName", label: "Sostenitore", question: "🙏 Nome del sostenitore? (scrivi - per saltare)" },
    { key: "animalSpecies", label: "Specie", question: "🐾 Specie di animale donato (mucca, maiale, capretta, gallina, ...)? (scrivi - per saltare)" },
    { key: "animalCount", label: "Numero animali", question: "🔢 Numero di animali donati? (scrivi - per saltare)" },
  ],
  "7": [
    { key: "familyName", label: "Famiglia", question: "🏠 Nome della famiglia? (scrivi - per saltare)" },
    { key: "sponsorName", label: "Sostenitore", question: "🙏 Nome del sostenitore? (scrivi - per saltare)" },
    { key: "mattressCount", label: "Materassi donati", question: "🛏️ Numero di materassi donati? (scrivi - per saltare)" },
  ],
  "8": [
    { key: "familyName", label: "Famiglia", question: "🏠 Nome della famiglia? (scrivi - per saltare)" },
    { key: "sponsorName", label: "Sostenitore", question: "🙏 Nome del sostenitore? (scrivi - per saltare)" },
    { key: "shoeCount", label: "Scarpe donate", question: "👟 Numero di paia di scarpe donate? (scrivi - per saltare)" },
  ],
  "9": [
    { key: "sponsorName", label: "Sostenitore", question: "🙏 Nome del sostenitore? (scrivi - per saltare)" },
    { key: "what", label: "Cosa", question: "🎁 Cosa è stato donato/fatto? (scrivi - per saltare)" },
  ],
  "10": [], // Vari: nessuna domanda, categoria solo descrittiva (esclusa dai report)
};

// Sessione di domande per categoria in corso per ogni chat: { steps, step, data }
const categorySessions = new Map();

// Formatta il dettaglio dei campi extra raccolti per categoria (bambino/sostenitore,
// specie/numero animali, ecc.) per i report mensili/annuali, raggruppato per categoria.
function formatCategoryDetail(details) {
  if (!details || details.length === 0) return "";

  const byCategory = new Map();
  details.forEach((d) => {
    if (!byCategory.has(d.category)) byCategory.set(d.category, []);
    byCategory.get(d.category).push(d);
  });

  let out = "";
  for (const [categoryName, entries] of byCategory) {
    const steps = CATEGORY_STEPS[String(entries[0].categoryNumber)] || [];
    out += `\n📋 **${categoryName} - dettaglio:**\n`;
    entries.forEach((entry, i) => {
      const parts = steps
        .map((s) => (entry.data?.[s.key] ? `${s.label}: ${entry.data[s.key]}` : null))
        .filter(Boolean);
      out += `${i + 1}. ${parts.length ? parts.join(", ") : "(dati non inseriti)"}\n`;
    });
  }
  return out;
}

// Stato dell'invio automatico del report mensile: memorizza l'ultimo mese per cui
// è già stato inviato, per non rimandarlo più volte (es. dopo un riavvio del bot).
function getAutoReportState() {
  try {
    if (fs.existsSync(AUTO_REPORT_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(AUTO_REPORT_STATE_FILE, "utf-8"));
    }
  } catch (err) {
    logger.warn(`Errore nel leggere lo stato del report automatico: ${err.message}`);
  }
  return {};
}

function saveAutoReportState(state) {
  try {
    fs.writeFileSync(AUTO_REPORT_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    logger.warn(`Errore nel salvare lo stato del report automatico: ${err.message}`);
  }
}

// Il primo giorno del mese manda automaticamente (una sola volta) il report
// riassuntivo del mese appena concluso alla chat configurata in ALLOWED_CHAT_ID.
async function sendAutomaticMonthlyReportIfDue(bot) {
  const now = new Date();
  if (now.getDate() !== 1) return;

  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const state = getAutoReportState();
  if (state.lastSentMonth === monthKey) return;

  const chatId = process.env.ALLOWED_CHAT_ID;
  if (!chatId) {
    logger.warn("Report mensile automatico non inviato: ALLOWED_CHAT_ID non configurato nel .env");
    return;
  }

  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const report = getMonthlyReport(prevMonth.getFullYear(), prevMonth.getMonth() + 1);

  try {
    if (!report.monthName || report.total === 0) {
      await bot.sendMessage(chatId, `📊 **Report automatico**: nessuna storia generata nel mese di ${prevMonth.toLocaleString("it-IT", { month: "long", year: "numeric" })}.`);
    } else {
      let message = `📊 **Report automatico ${report.monthName}**\n\n`;
      message += `**Totale storie: ${report.total}**\n\n`;
      Object.entries(report.report).forEach(([category, count]) => {
        message += `• ${category}: ${count}\n`;
      });
      message += formatCategoryDetail(report.details);
      await bot.sendMessage(chatId, message);
    }
    logger.info(`Report mensile automatico inviato per ${monthKey}`);
    state.lastSentMonth = monthKey;
    saveAutoReportState(state);
  } catch (err) {
    logger.error(`Errore nell'invio del report mensile automatico: ${err.message}`);
    // Non aggiorniamo lo stato: verrà ritentato al prossimo controllo orario.
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INTAKE_DIR = path.join(__dirname, "..", "intake");
const OUTPUT_DIR = path.join(__dirname, "..", "output");
const STATE_FILE = path.join(__dirname, "..", "state.json");
const AUTO_REPORT_STATE_FILE = path.join(__dirname, "..", "auto-report-state.json");

const EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Materiale (foto + testi) accumulato per ogni chat, in attesa del comando /genera.
// Persistente: caricato da state.json all'avvio, salvato dopo ogni operazione.
const pendingByChat = new Map();

// Client Meta API (per pubblicare su Facebook/Instagram)
let metaAPI = null;

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      for (const [chatId, chatData] of Object.entries(data)) {
        pendingByChat.set(chatId, chatData);
      }
      logger.info(`Stato caricato (${Object.keys(data).length} chat)`);
    }
  } catch (err) {
    logger.warn(`Errore nel caricare lo stato: ${err.message}`);
  }
}

function saveState() {
  try {
    const data = Object.fromEntries(pendingByChat);
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), "utf-8");
    logger.debug(`Stato salvato (${pendingByChat.size} chat)`);
  } catch (err) {
    logger.error(`Errore nel salvare lo stato: ${err.message}`);
  }
}

function getPending(chatId) {
  if (!pendingByChat.has(chatId)) {
    pendingByChat.set(chatId, { photos: [], notes: [] });
  }
  return pendingByChat.get(chatId);
}

export async function startBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("Manca TELEGRAM_BOT_TOKEN nel file .env");
  }

  loadState();

  // Inizializza Meta API (se configurato)
  metaAPI = await initMetaAPI();

  const bot = new TelegramBot(token, { polling: true });
  logger.info("Bot Telegram avviato, in ascolto...");

  bot.on("polling_error", (err) => {
    logger.error(`Errore di polling: ${err.message}`);
  });

  const isAllowed = (chatId) => {
    const allowedChatId = process.env.ALLOWED_CHAT_ID;
    return !allowedChatId || String(chatId) === String(allowedChatId);
  };

  // Scarica un'immagine (foto compressa o documento immagine) e la aggiunge al materiale in attesa
  async function addImageToPending(msg, fileId, mediaType, caption, fileSize = null) {
    // Valida il formato
    const formatCheck = validation.validatePhoto(mediaType, fileSize || 0);
    if (!formatCheck.valid) {
      await bot.sendMessage(msg.chat.id, `⚠️ ${formatCheck.error}`);
      return;
    }

    // Verifica il numero di foto accumulate
    const pending = getPending(msg.chat.id);
    const photoCheck = validation.validatePhotoCount(pending.photos.length);
    if (!photoCheck.valid) {
      await bot.sendMessage(msg.chat.id, `⚠️ ${photoCheck.error}`);
      return;
    }

    // Scarica la foto
    const fileLink = await bot.getFileLink(fileId);
    const ext = EXT_BY_MIME[mediaType] || "jpg";

    try {
      const res = await fetch(fileLink);

      // Valida la dimensione durante il download
      const contentLength = res.headers.get("content-length");
      if (contentLength) {
        const sizeCheck = validation.validateDownloadSize(parseInt(contentLength));
        if (!sizeCheck.valid) {
          await bot.sendMessage(msg.chat.id, `⚠️ ${sizeCheck.error}`);
          return;
        }
      }

      const buffer = Buffer.from(await res.arrayBuffer());

      // Validazione finale della dimensione effettiva
      const sizeCheck = validation.validateDownloadSize(buffer.length);
      if (!sizeCheck.valid) {
        await bot.sendMessage(msg.chat.id, `⚠️ ${sizeCheck.error}`);
        return;
      }

      // Verifica che non sia un duplicato di una foto già in attesa
      const hash = crypto.createHash("sha256").update(buffer).digest("hex");
      if (pending.photos.some((p) => p.hash === hash)) {
        await bot.sendMessage(msg.chat.id, "⚠️ Questa foto è già stata caricata, non è stata aggiunta di nuovo.");
        return;
      }

      const timestamp = Date.now();
      const imgPath = path.join(INTAKE_DIR, `${timestamp}.${ext}`);
      const txtPath = path.join(INTAKE_DIR, `${timestamp}.txt`);

      fs.writeFileSync(imgPath, buffer);
      fs.writeFileSync(txtPath, caption);

      pending.photos.push({ imgPath, caption, mediaType, hash });
      saveState();

      logger.info(`Foto aggiunta: ${buffer.length / 1024}KB (${pending.photos.length} totali)`);
      await bot.sendMessage(
        msg.chat.id,
        `📥 Foto aggiunta (${pending.photos.length}/${validation.getLimits().MAX_TOTAL_PHOTOS}). Manda altre foto/testi, oppure scrivi /genera quando hai finito.`
      );
      await remindCategoryIfNeeded(msg.chat.id, pending);
    } catch (err) {
      logger.error(`Errore nel scaricare la foto: ${err.message}`);
      await bot.sendMessage(msg.chat.id, "⚠️ Errore nel download della foto, riprova.");
    }
  }

  // Genera le bozze social dal materiale in attesa. categoryData contiene gli eventuali
  // campi opzionali specifici della categoria selezionata (bambino/sostenitore, animali, ecc.).
  async function runGenerate(chatId, categoryData = {}) {
    const pending = pendingByChat.get(chatId);
    if (!pending) return;

    try {
      await bot.sendMessage(
        chatId,
        `📥 Genero le bozze da ${pending.photos.length} foto e ${pending.notes.length} testi extra...`
      );

      const selected = selectedCategory.get(chatId);
      const steps = selected ? CATEGORY_STEPS[selected.id] || [] : [];
      const categoryLines = steps
        .map((s) => (categoryData[s.key] ? `${s.label}: ${categoryData[s.key]}` : null))
        .filter(Boolean);

      const rawText = [
        ...(categoryLines.length ? [categoryLines.join("\n")] : []),
        ...pending.photos.map((p) => p.caption).filter(Boolean),
        ...pending.notes,
      ].join("\n\n");
      const images = pending.photos.map((p) => ({
        buffer: fs.readFileSync(p.imgPath),
        mediaType: p.mediaType || "image/jpeg",
      }));

      const result = await generateSocialContent(rawText, images, {
        name: selected?.name,
        rules: selected ? CATEGORY_RULES[selected.id] : "",
      });

      const timestamp = Date.now();
      const outBase = path.join(OUTPUT_DIR, `${timestamp}`);
      fs.writeFileSync(`${outBase}_facebook.txt`, result.facebookPost);
      fs.writeFileSync(`${outBase}_instagram.txt`, result.instagramStory);
      fs.writeFileSync(`${outBase}_linkedin.txt`, result.linkedinPost);
      fs.writeFileSync(`${outBase}_blog.txt`, `${result.blogTitle}\n\n${result.blogBody}`);
      fs.writeFileSync(`${outBase}_reel.txt`, result.reelScript);

      // YouTube Shorts
      if (result.youtubeShorts) {
        const youtubeContent = `TITOLO:\n${result.youtubeShorts.titolo}\n\nSCRIPT:\n${result.youtubeShorts.script}\n\nISTRUZIONI:\n${result.youtubeShorts.istruzioni}\n\nCTA:\n${result.youtubeShorts.cta}`;
        fs.writeFileSync(`${outBase}_youtube.txt`, youtubeContent);
      }

      // Salva le foto originali
      pending.photos.forEach((p, i) => {
        const ext = path.extname(p.imgPath);
        fs.copyFileSync(p.imgPath, `${outBase}_${i + 1}${ext}`);
      });

      // Ottimizza le foto per ogni social
      let optimizedPhotos = {};
      try {
        optimizedPhotos = await optimizePhotosForSocial(images);
        // Salva le foto ottimizzate con suffissi social
        for (const [social, buffer] of Object.entries(optimizedPhotos)) {
          if (Array.isArray(buffer)) {
            buffer.forEach((b, idx) => fs.writeFileSync(`${outBase}_optimized_${social}_${idx + 1}.jpg`, b));
          } else {
            fs.writeFileSync(`${outBase}_optimized_${social}.jpg`, buffer);
          }
        }
        logger.info(`Foto ottimizzate salvate per ${Object.keys(optimizedPhotos).length} social`);
      } catch (err) {
        logger.warn(`Errore nell'ottimizzazione foto: ${err.message}`);
        // Se l'ottimizzazione fallisce, usa le foto originali
        optimizedPhotos = {
          facebook: images.map((img) => img.buffer),
          instagram: images[0].buffer,
          linkedin: images[0].buffer,
          blog: images[0].buffer,
          reel: images[0].buffer,
        };
      }

      // Cleanup: cancella i file temporanei da intake/
      pending.photos.forEach((p) => {
        try {
          const txtPath = p.imgPath.replace(/\.[^.]+$/, ".txt");
          if (fs.existsSync(p.imgPath)) fs.unlinkSync(p.imgPath);
          if (fs.existsSync(txtPath)) fs.unlinkSync(txtPath);
        } catch (err) {
          logger.warn(`Errore nel cancellare file temporaneo: ${err.message}`);
        }
      });

      pendingByChat.delete(chatId);
      saveState();

      // Salva la bozza nel database SQLite con categoria
      const formats = [];
      if (result.facebookPost) formats.push("facebook");
      if (result.instagramStory) formats.push("instagram");
      if (result.linkedinPost) formats.push("linkedin");
      if (result.blogTitle) formats.push("blog");
      if (result.reelScript) formats.push("reel");
      if (result.youtubeShorts) formats.push("youtube");

      const totalTextLength = rawText.length;
      const category = selectedCategory.get(chatId);
      saveDraft(
        timestamp,
        pending.photos.length,
        formats,
        totalTextLength,
        category?.name || null,
        category?.id || null,
        categoryData
      );

      // Pulisci la categoria dopo la generazione
      selectedCategory.delete(chatId);

      let metaMessage = "";

      // Pubblica su Facebook e Instagram (come bozze) se Meta API è configurata
      if (metaAPI) {
        try {
          const metaResults = await metaAPI.publishToMetaBusiness(
            result.facebookPost,
            result.instagramStory,
            images,
            optimizedPhotos
          );

          if (metaResults.facebook?.success) {
            metaMessage += "📘 Facebook: pubblicato (bozza)\n";
          }
          if (metaResults.instagram?.success) {
            metaMessage += "📷 Instagram: pubblicato (bozza)\n";
          }
          if (metaResults.errors.length > 0) {
            metaMessage += `⚠️ Errori Meta:\n${metaResults.errors.join("\n")}\n`;
          }
          if (!metaResults.facebook?.success && !metaResults.instagram?.success) {
            metaMessage = "⚠️ Nessun canale Meta pubblicato\n";
          }
        } catch (err) {
          logger.error(`Errore nella pubblicazione Meta: ${err.message}`);
          metaMessage = `⚠️ Errore Meta API: ${err.message}\n`;
        }
      }

      await bot.sendMessage(
        chatId,
        `✅ Bozze pronte in output/${timestamp}_*.txt (Facebook, Instagram, LinkedIn, blog, Reel)\n\n${metaMessage}`
      );
    } catch (err) {
      logger.error(`Errore nel generare i contenuti: ${err.message}`);
      logger.error(`Stack trace: ${err.stack}`);

      const materialsLeft = `${pending.photos.length} foto, ${pending.notes.length} testi`;
      await bot.sendMessage(
        chatId,
        `⚠️ Errore nella generazione. Il tuo materiale rimane intatto (${materialsLeft}).\n\nRiprova con /genera.\n\nDettagli errore: ${err.message}`
      );
    }
  }

  // Log dei messaggi ricevuti
  bot.on("message", (msg) => {
    logger.debug(`Messaggio da chat ${msg.chat.id} (${msg.chat.title || msg.chat.first_name})`);
  });

  bot.on("photo", async (msg) => {
    if (!isAllowed(msg.chat.id)) return;
    try {
      const photo = msg.photo[msg.photo.length - 1]; // risoluzione più alta
      await addImageToPending(msg, photo.file_id, "image/jpeg", msg.caption || "", photo.file_size);
    } catch (err) {
      logger.error(`Errore nel salvare la foto: ${err.message}`);
      await bot.sendMessage(msg.chat.id, "⚠️ Si è verificato un errore nel salvare la foto, riprova.");
    }
  });

  // Immagini mandate come file/documento (es. "Invia come file" invece che come foto compressa)
  bot.on("document", async (msg) => {
    if (!isAllowed(msg.chat.id)) return;
    const mediaType = msg.document.mime_type || "";
    if (!mediaType.startsWith("image/")) return; // ignora documenti non-immagine

    try {
      await addImageToPending(msg, msg.document.file_id, mediaType, msg.caption || "", msg.document.file_size);
    } catch (err) {
      logger.error(`Errore nel salvare il documento immagine: ${err.message}`);
      await bot.sendMessage(msg.chat.id, "⚠️ Si è verificato un errore nel salvare la foto, riprova.");
    }
  });

  // Testo mandato come messaggio a sé (non didascalia di una foto): si aggiunge come nota extra
  bot.on("text", async (msg) => {
    if (!isAllowed(msg.chat.id)) return;
    if (msg.text.startsWith("/")) return; // i comandi si gestiscono a parte

    const chatId = msg.chat.id;

    // Se è in corso la sequenza di domande per la categoria selezionata, questo testo
    // è la risposta alla domanda corrente (campo opzionale: "-" per saltarlo).
    const categorySession = categorySessions.get(chatId);
    if (categorySession) {
      const step = categorySession.steps[categorySession.step];
      const answer = msg.text.trim();
      if (answer !== "-") {
        categorySession.data[step.key] = answer;
      }

      const nextIndex = categorySession.step + 1;
      if (nextIndex < categorySession.steps.length) {
        categorySession.step = nextIndex;
        await bot.sendMessage(chatId, categorySession.steps[nextIndex].question);
      } else {
        const categoryData = categorySession.data;
        categorySessions.delete(chatId);
        await runGenerate(chatId, categoryData);
      }
      return;
    }

    // Valida la lunghezza del messaggio singolo
    const msgCheck = validation.validateTextMessage(msg.text);
    if (!msgCheck.valid) {
      await bot.sendMessage(msg.chat.id, `⚠️ ${msgCheck.error}`);
      return;
    }

    const pending = getPending(msg.chat.id);

    // Valida la lunghezza totale del testo accumulato
    const captions = pending.photos.map((p) => p.caption).filter(Boolean);
    const totalLengthCheck = validation.validateTotalTextLength(captions, [
      ...pending.notes,
      msg.text,
    ]);
    if (!totalLengthCheck.valid) {
      await bot.sendMessage(msg.chat.id, `⚠️ ${totalLengthCheck.error}`);
      return;
    }

    pending.notes.push(msg.text);
    saveState();
    logger.info(`Testo aggiunto: ${msg.text.length} char (${pending.notes.length} totali)`);
    await bot.sendMessage(msg.chat.id, "📝 Testo aggiunto al materiale in attesa.");
    await remindCategoryIfNeeded(msg.chat.id, pending);
  });

  const HELP_TEXT = `👋 Ciao! Ecco come funziona il bot per creare le storie social:

1️⃣ Scegli la categoria della storia con /categoria (es. Adozioni scolastiche, Animali domestici, ...)
2️⃣ Manda le foto e un testo/descrizione della storia (uno o più messaggi, come preferisci)
3️⃣ Scrivi /genera per creare le bozze

Alcune categorie fanno anche qualche domanda extra (es. nome sostenitore): il bot te le fa una alla volta, rispondi e invia, poi aspetta la domanda successiva. Se non hai un dato, scrivi solo "-" e premi invio per saltare quella domanda.

Altri comandi utili:
/status - vedi quante foto/testi hai in attesa
/reset - cancella il materiale in attesa e ricomincia
/report-mese - riepilogo storie del mese
/report-anno - riepilogo storie dell'anno`;

  bot.onText(/^\/(start|help|aiuto)$/i, async (msg) => {
    if (!isAllowed(msg.chat.id)) return;
    await bot.sendMessage(msg.chat.id, HELP_TEXT);
  });

  // Ricorda (una sola volta per storia) di scegliere la categoria se non è stata
  // ancora selezionata quando arrivano foto o testo.
  async function remindCategoryIfNeeded(chatId, pending) {
    if (selectedCategory.get(chatId) || pending.categoryReminded) return;
    pending.categoryReminded = true;
    saveState();
    await bot.sendMessage(
      chatId,
      "⚠️ Non hai ancora scelto una categoria per questa storia. Usa /categoria prima di scrivere /genera."
    );
  }

  bot.onText(/^\/status$/i, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) return;

    const pending = pendingByChat.get(chatId);
    if (!pending || (pending.photos.length === 0 && pending.notes.length === 0)) {
      await bot.sendMessage(chatId, "📋 Nessun materiale in attesa. Manda foto/testi per iniziare.");
      return;
    }

    const status = `📋 Materiale accumulato:\n• ${pending.photos.length} foto\n• ${pending.notes.length} testi extra`;
    await bot.sendMessage(chatId, status);
  });

  bot.onText(/^\/reset$/i, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) return;

    const pending = pendingByChat.get(chatId);
    if (!pending || (pending.photos.length === 0 && pending.notes.length === 0)) {
      await bot.sendMessage(chatId, "⚠️ Nessun materiale da cancellare.");
      return;
    }

    pending.photos.forEach((p) => {
      try {
        const txtPath = p.imgPath.replace(/\.[^.]+$/, ".txt");
        if (fs.existsSync(p.imgPath)) fs.unlinkSync(p.imgPath);
        if (fs.existsSync(txtPath)) fs.unlinkSync(txtPath);
      } catch (err) {
        logger.warn(`Errore nel cancellare file: ${err.message}`);
      }
    });

    pendingByChat.delete(chatId);
    saveState();

    await bot.sendMessage(chatId, "✅ Materiale cancellato. Puoi iniziare una nuova storia.");
  });

  // Comando /categoria - Seleziona categoria per la storia
  bot.onText(/^\/categoria$/i, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) return;

    const buttons = Object.entries(CATEGORIES).map(([id, name]) => [
      { text: `${id}. ${name}`, callback_data: `category_${id}` },
    ]);

    await bot.sendMessage(chatId, "🏷️ Seleziona la categoria per questa storia:", {
      reply_markup: { inline_keyboard: buttons },
    });
  });

  // Callback per selezione categoria
  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    if (!isAllowed(chatId)) return;

    if (query.data.startsWith("category_")) {
      const categoryId = query.data.replace("category_", "");
      const categoryName = CATEGORIES[categoryId];

      if (categoryName) {
        selectedCategory.set(chatId, { id: categoryId, name: categoryName });
        await bot.answerCallbackQuery(query.id);
        await bot.sendMessage(chatId, `✅ Categoria selezionata: **${categoryName}**\n\nOra manda foto e testo, poi scrivi /genera`);
        logger.info(`Categoria selezionata: ${categoryName} (chat ${chatId})`);
      }
    }
  });

  // Comando /report-mese - Report mensile
  bot.onText(/^\/report-mese(?:\s+(\d{4})\s+(\d{1,2}))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) return;

    let year = new Date().getFullYear();
    let month = new Date().getMonth() + 1;

    if (match[1] && match[2]) {
      year = parseInt(match[1]);
      month = parseInt(match[2]);
    }

    const report = getMonthlyReport(year, month);

    if (!report.monthName) {
      await bot.sendMessage(chatId, "⚠️ Nessun dato disponibile per questo mese.");
      return;
    }

    let message = `📊 **Report ${report.monthName}**\n\n`;
    message += `**Totale storie: ${report.total}**\n\n`;

    Object.entries(report.report).forEach(([category, count]) => {
      message += `• ${category}: ${count}\n`;
    });

    message += formatCategoryDetail(report.details);

    await bot.sendMessage(chatId, message);
    logger.info(`Report mensile: ${year}-${month}`);
  });

  // Comando /report-anno - Report annuale
  bot.onText(/^\/report-anno(?:\s+(\d{4}))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) return;

    let year = new Date().getFullYear();

    if (match[1]) {
      year = parseInt(match[1]);
    }

    const report = getYearlyReport(year);

    if (!report.year || report.total === 0) {
      await bot.sendMessage(chatId, "⚠️ Nessun dato disponibile per questo anno.");
      return;
    }

    let message = `📈 **Report Annuale ${report.year}**\n\n`;
    message += `**Totale storie: ${report.total}**\n\n`;

    Object.entries(report.report).forEach(([category, count]) => {
      message += `• ${category}: ${count}\n`;
    });

    message += formatCategoryDetail(report.details);

    await bot.sendMessage(chatId, message);
    logger.info(`Report annuale: ${year}`);
  });

  bot.onText(/^\/genera$/i, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) return;

    // Valida il rate limiting (cooldown tra /genera)
    const cooldownCheck = validation.validateGenerateCooldown(chatId);
    if (!cooldownCheck.valid) {
      await bot.sendMessage(chatId, `⏱️ ${cooldownCheck.error}`);
      return;
    }

    // Richiedi la categoria prima di generare
    const selected = selectedCategory.get(chatId);
    if (!selected) {
      await bot.sendMessage(chatId, "⚠️ Seleziona prima una categoria con /categoria, poi riprova con /genera.");
      return;
    }

    const pending = pendingByChat.get(chatId);

    // Valida il materiale disponibile
    const materialCheck = validation.validateMaterialForGenerate(
      pending?.photos.length || 0,
      pending?.notes.length || 0
    );
    if (!materialCheck.valid) {
      await bot.sendMessage(chatId, `⚠️ ${materialCheck.error}`);
      return;
    }

    // Per le categorie che lo prevedono, chiedi prima (in sequenza, campi opzionali)
    // i dati specifici; la generazione parte dopo l'ultima risposta.
    const steps = CATEGORY_STEPS[selected.id] || [];
    if (steps.length > 0) {
      categorySessions.set(chatId, { steps, step: 0, data: {} });
      await bot.sendMessage(
        chatId,
        `Ti faccio ${steps.length} ${steps.length === 1 ? "domanda" : "domande"}, una alla volta: rispondi e invia, poi aspetta la prossima. Se non hai il dato, scrivi solo "-" e premi invio per saltarla.\n\n${steps[0].question}`
      );
      return;
    }

    await runGenerate(chatId, {});
  });

  // Controlla (al via e poi ogni ora) se è il 1° del mese e va inviato il report automatico
  await sendAutomaticMonthlyReportIfDue(bot);
  setInterval(() => sendAutomaticMonthlyReportIfDue(bot), 60 * 60 * 1000);

  return bot;
}
