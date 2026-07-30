import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateSocialContent } from "./generateContent.js";
import { logger } from "./logger.js";
import { validation } from "./validation.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INTAKE_DIR = path.join(__dirname, "..", "intake");
const OUTPUT_DIR = path.join(__dirname, "..", "output");
const STATE_FILE = path.join(__dirname, "..", "state.json");

const EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Materiale (foto + testi) accumulato per ogni chat, in attesa del comando /genera.
// Persistente: caricato da state.json all'avvio, salvato dopo ogni operazione.
const pendingByChat = new Map();

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

export function startBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("Manca TELEGRAM_BOT_TOKEN nel file .env");
  }

  loadState();
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

      const timestamp = Date.now();
      const imgPath = path.join(INTAKE_DIR, `${timestamp}.${ext}`);
      const txtPath = path.join(INTAKE_DIR, `${timestamp}.txt`);

      fs.writeFileSync(imgPath, buffer);
      fs.writeFileSync(txtPath, caption);

      pending.photos.push({ imgPath, caption, mediaType });
      saveState();

      logger.info(`Foto aggiunta: ${buffer.length / 1024}KB (${pending.photos.length} totali)`);
      await bot.sendMessage(
        msg.chat.id,
        `📥 Foto aggiunta (${pending.photos.length}/${validation.getLimits().MAX_TOTAL_PHOTOS}). Manda altre foto/testi, oppure scrivi /genera quando hai finito.`
      );
    } catch (err) {
      logger.error(`Errore nel scaricare la foto: ${err.message}`);
      await bot.sendMessage(msg.chat.id, "⚠️ Errore nel download della foto, riprova.");
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
  });

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

  bot.onText(/^\/genera$/i, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) return;

    // Valida il rate limiting (cooldown tra /genera)
    const cooldownCheck = validation.validateGenerateCooldown(chatId);
    if (!cooldownCheck.valid) {
      await bot.sendMessage(chatId, `⏱️ ${cooldownCheck.error}`);
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

    try {
      await bot.sendMessage(
        chatId,
        `📥 Genero le bozze da ${pending.photos.length} foto e ${pending.notes.length} testi extra...`
      );

      const rawText = [...pending.photos.map((p) => p.caption).filter(Boolean), ...pending.notes].join("\n\n");
      const images = pending.photos.map((p) => ({
        buffer: fs.readFileSync(p.imgPath),
        mediaType: p.mediaType || "image/jpeg",
      }));

      const result = await generateSocialContent(rawText, images);

      const timestamp = Date.now();
      const outBase = path.join(OUTPUT_DIR, `${timestamp}`);
      fs.writeFileSync(`${outBase}_facebook.txt`, result.facebookPost);
      fs.writeFileSync(`${outBase}_instagram.txt`, result.instagramStory);
      fs.writeFileSync(`${outBase}_linkedin.txt`, result.linkedinPost);
      fs.writeFileSync(`${outBase}_blog.txt`, `${result.blogTitle}\n\n${result.blogBody}`);
      fs.writeFileSync(`${outBase}_reel.txt`, result.reelScript);
      pending.photos.forEach((p, i) => {
        const ext = path.extname(p.imgPath);
        fs.copyFileSync(p.imgPath, `${outBase}_${i + 1}${ext}`);
      });

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

      await bot.sendMessage(
        chatId,
        `✅ Bozze pronte in output/${timestamp}_*.txt (Facebook, Instagram, LinkedIn, blog, Reel)`
      );
    } catch (err) {
      logger.error(`Errore nel generare i contenuti: ${err.message}`);
      await bot.sendMessage(chatId, "⚠️ Si è verificato un errore nella generazione, riprova con /genera.");
    }
  });

  return bot;
}
