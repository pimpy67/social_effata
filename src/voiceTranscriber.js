import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { logger } from "./logger.js";

let openaiClient = null;

export function initVoiceTranscriber() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn("OPENAI_API_KEY non configurato - trascrizione vocale disabilitata");
    return false;
  }

  openaiClient = new OpenAI({ apiKey });
  logger.info("Voice transcriber inizializzato");
  return true;
}

export function isVoiceTranscriberReady() {
  return openaiClient !== null;
}

// Scarica il file vocale da Telegram e lo trascrrive con Whisper
export async function transcribeVoiceMessage(bot, fileId, outputDir) {
  if (!isVoiceTranscriberReady()) {
    throw new Error("Voice transcriber non è stato inizializzato (manca OPENAI_API_KEY)");
  }

  try {
    // Scarica il file vocale da Telegram
    const fileLink = await bot.getFileLink(fileId);
    const res = await fetch(fileLink);
    const buffer = Buffer.from(await res.arrayBuffer());

    // Salva temporaneamente come .ogg (formato nativo di Telegram)
    const timestamp = Date.now();
    const tempPath = path.join(outputDir, `voice_${timestamp}.ogg`);
    fs.writeFileSync(tempPath, buffer);

    try {
      // Trascrivi con Whisper
      const audioFile = fs.createReadStream(tempPath);
      const transcript = await openaiClient.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: "it", // Italiano
      });

      logger.info(`Messaggio vocale trascritto: ${transcript.text.substring(0, 50)}...`);

      return {
        text: transcript.text,
        success: true,
      };
    } finally {
      // Cancella il file temporaneo
      try {
        fs.unlinkSync(tempPath);
      } catch (err) {
        logger.warn(`Impossibile cancellare il file temporaneo ${tempPath}: ${err.message}`);
      }
    }
  } catch (err) {
    logger.error(`Errore nella trascrizione del messaggio vocale: ${err.message}`);
    throw err;
  }
}
