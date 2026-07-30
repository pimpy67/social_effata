import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateSocialContent } from "./generateContent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INTAKE_DIR = path.join(__dirname, "..", "intake");
const OUTPUT_DIR = path.join(__dirname, "..", "output");

const EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Materiale (foto + testi) accumulato per ogni chat, in attesa del comando /genera.
// Vive solo in memoria: si perde se il bot viene riavviato prima di /genera.
const pendingByChat = new Map();

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

  const bot = new TelegramBot(token, { polling: true });
  console.log("Bot Telegram avviato, in ascolto...");

  bot.on("polling_error", (err) => {
    console.error("Errore di polling:", err.message);
  });

  const isAllowed = (chatId) => {
    const allowedChatId = process.env.ALLOWED_CHAT_ID;
    return !allowedChatId || String(chatId) === String(allowedChatId);
  };

  // Scarica un'immagine (foto compressa o documento immagine) e la aggiunge al materiale in attesa
  async function addImageToPending(msg, fileId, mediaType, caption) {
    const fileLink = await bot.getFileLink(fileId);
    const ext = EXT_BY_MIME[mediaType] || "jpg";

    const timestamp = Date.now();
    const imgPath = path.join(INTAKE_DIR, `${timestamp}.${ext}`);
    const txtPath = path.join(INTAKE_DIR, `${timestamp}.txt`);

    const res = await fetch(fileLink);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(imgPath, buffer);
    fs.writeFileSync(txtPath, caption);

    const pending = getPending(msg.chat.id);
    pending.photos.push({ imgPath, caption, mediaType });

    await bot.sendMessage(
      msg.chat.id,
      `📥 Foto aggiunta (${pending.photos.length} in attesa). Manda altre foto/testi, oppure scrivi /genera quando hai finito.`
    );
  }

  // Stampa l'ID della chat per aiutarti a impostare ALLOWED_CHAT_ID
  bot.on("message", (msg) => {
    console.log(`Messaggio ricevuto da chat ID: ${msg.chat.id} (${msg.chat.title || msg.chat.first_name})`);
  });

  bot.on("photo", async (msg) => {
    if (!isAllowed(msg.chat.id)) return;
    try {
      const photo = msg.photo[msg.photo.length - 1]; // risoluzione più alta
      await addImageToPending(msg, photo.file_id, "image/jpeg", msg.caption || "");
    } catch (err) {
      console.error("Errore nel salvare la foto:", err);
      await bot.sendMessage(msg.chat.id, "⚠️ Si è verificato un errore nel salvare la foto, riprova.");
    }
  });

  // Immagini mandate come file/documento (es. "Invia come file" invece che come foto compressa)
  bot.on("document", async (msg) => {
    if (!isAllowed(msg.chat.id)) return;
    const mediaType = msg.document.mime_type || "";
    if (!mediaType.startsWith("image/")) return; // ignora documenti non-immagine

    try {
      await addImageToPending(msg, msg.document.file_id, mediaType, msg.caption || "");
    } catch (err) {
      console.error("Errore nel salvare il documento immagine:", err);
      await bot.sendMessage(msg.chat.id, "⚠️ Si è verificato un errore nel salvare la foto, riprova.");
    }
  });

  // Testo mandato come messaggio a sé (non didascalia di una foto): si aggiunge come nota extra
  bot.on("text", async (msg) => {
    if (!isAllowed(msg.chat.id)) return;
    if (msg.text.startsWith("/")) return; // i comandi si gestiscono a parte

    const pending = getPending(msg.chat.id);
    pending.notes.push(msg.text);
    await bot.sendMessage(msg.chat.id, "📝 Testo aggiunto al materiale in attesa.");
  });

  bot.onText(/^\/genera$/i, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAllowed(chatId)) return;

    const pending = pendingByChat.get(chatId);
    if (!pending || pending.photos.length === 0) {
      await bot.sendMessage(chatId, "⚠️ Non ho ancora ricevuto nessuna foto. Mandane almeno una prima di scrivere /genera.");
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

      pendingByChat.delete(chatId);

      await bot.sendMessage(
        chatId,
        `✅ Bozze pronte in output/${timestamp}_*.txt (Facebook, Instagram, LinkedIn, blog, Reel)`
      );
    } catch (err) {
      console.error("Errore nel generare i contenuti:", err);
      await bot.sendMessage(chatId, "⚠️ Si è verificato un errore nella generazione, riprova con /genera.");
    }
  });

  return bot;
}
