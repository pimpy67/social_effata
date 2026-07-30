import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateSocialContent } from "./generateContent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INTAKE_DIR = path.join(__dirname, "..", "intake");
const OUTPUT_DIR = path.join(__dirname, "..", "output");

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

  // Stampa l'ID della chat per aiutarti a impostare ALLOWED_CHAT_ID
  bot.on("message", (msg) => {
    console.log(`Messaggio ricevuto da chat ID: ${msg.chat.id} (${msg.chat.title || msg.chat.first_name})`);
  });

  bot.on("photo", async (msg) => {
    const allowedChatId = process.env.ALLOWED_CHAT_ID;
    if (allowedChatId && String(msg.chat.id) !== String(allowedChatId)) {
      return; // ignora messaggi da chat non autorizzate
    }

    try {
      const caption = msg.caption || "";
      const photo = msg.photo[msg.photo.length - 1]; // risoluzione più alta
      const fileLink = await bot.getFileLink(photo.file_id);

      const timestamp = Date.now();
      const imgPath = path.join(INTAKE_DIR, `${timestamp}.jpg`);
      const txtPath = path.join(INTAKE_DIR, `${timestamp}.txt`);

      const res = await fetch(fileLink);
      const buffer = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(imgPath, buffer);
      fs.writeFileSync(txtPath, caption);

      await bot.sendMessage(msg.chat.id, "📥 Ricevuto! Genero la bozza per i social...");

      const result = await generateSocialContent(caption);
      const outBase = path.join(OUTPUT_DIR, `${timestamp}`);
      fs.writeFileSync(`${outBase}_facebook.txt`, result.facebookPost);
      fs.writeFileSync(`${outBase}_instagram.txt`, result.instagramStory);
      fs.copyFileSync(imgPath, `${outBase}.jpg`);

      await bot.sendMessage(
        msg.chat.id,
        `✅ Bozza pronta in output/${timestamp}_facebook.txt e _instagram.txt`
      );
    } catch (err) {
      console.error("Errore nel processare la foto:", err);
      await bot.sendMessage(msg.chat.id, "⚠️ Si è verificato un errore, riprova.");
    }
  });

  return bot;
}
