import { logger } from "./logger.js";

const VALIDATION_CONFIG = {
  MAX_FILE_SIZE_MB: 25,           // Max 25MB per foto
  MAX_TOTAL_PHOTOS: 10,           // Max 10 foto per storia
  MAX_TEXT_LENGTH: 50000,         // Max 50k caratteri totali
  MAX_MESSAGE_LENGTH: 5000,       // Max 5k per messaggio
  GENERATE_COOLDOWN_SECONDS: 30,  // Min 30 secondi tra /genera
};

// Traccia l'ultimo /genera per ogni chat (per rate limiting)
const lastGenerateTime = new Map();

export const validation = {
  // Valida una foto (formato + dimensione)
  validatePhoto(mimeType, fileSize) {
    const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

    if (!ALLOWED_TYPES.includes(mimeType)) {
      return {
        valid: false,
        error: `Formato immagine non supportato. Usa: JPG, PNG, WebP o GIF. Ricevuto: ${mimeType}`,
      };
    }

    const fileSizeMB = fileSize / (1024 * 1024);
    if (fileSizeMB > VALIDATION_CONFIG.MAX_FILE_SIZE_MB) {
      return {
        valid: false,
        error: `Foto troppo grande (${fileSizeMB.toFixed(1)}MB). Max: ${VALIDATION_CONFIG.MAX_FILE_SIZE_MB}MB`,
      };
    }

    return { valid: true };
  },

  // Valida il numero totale di foto accumulate
  validatePhotoCount(currentCount) {
    if (currentCount >= VALIDATION_CONFIG.MAX_TOTAL_PHOTOS) {
      return {
        valid: false,
        error: `Limite di foto raggiunto (${VALIDATION_CONFIG.MAX_TOTAL_PHOTOS} max). Genera ora con /genera.`,
      };
    }
    return { valid: true };
  },

  // Valida un messaggio di testo
  validateTextMessage(text) {
    if (!text || text.trim().length === 0) {
      return { valid: false, error: "Messaggio vuoto." };
    }

    if (text.length > VALIDATION_CONFIG.MAX_MESSAGE_LENGTH) {
      return {
        valid: false,
        error: `Messaggio troppo lungo (${text.length} char). Max: ${VALIDATION_CONFIG.MAX_MESSAGE_LENGTH}`,
      };
    }

    return { valid: true };
  },

  // Valida la lunghezza totale di testo accumulato
  validateTotalTextLength(captions, notes) {
    const totalText = [...captions, ...notes].join("\n").length;

    if (totalText > VALIDATION_CONFIG.MAX_TEXT_LENGTH) {
      return {
        valid: false,
        error: `Testo troppo lungo (${totalText} char). Max: ${VALIDATION_CONFIG.MAX_TEXT_LENGTH}. Genera ora con /genera.`,
      };
    }

    return { valid: true };
  },

  // Valida il rate limiting per /genera
  validateGenerateCooldown(chatId) {
    const now = Date.now() / 1000; // secondi
    const lastTime = lastGenerateTime.get(chatId) || 0;
    const timeSinceLastGenerate = now - lastTime;

    if (timeSinceLastGenerate < VALIDATION_CONFIG.GENERATE_COOLDOWN_SECONDS) {
      const remainingSeconds = Math.ceil(
        VALIDATION_CONFIG.GENERATE_COOLDOWN_SECONDS - timeSinceLastGenerate
      );
      return {
        valid: false,
        error: `Aspetta ${remainingSeconds}s prima di generare di nuovo.`,
      };
    }

    lastGenerateTime.set(chatId, now);
    return { valid: true };
  },

  // Valida che ci sia materiale sufficiente per /genera
  validateMaterialForGenerate(photoCount, textCount) {
    if (photoCount === 0) {
      return {
        valid: false,
        error: "Nessuna foto. Mandane almeno una prima di scrivere /genera.",
      };
    }

    if (photoCount + textCount === 0) {
      return {
        valid: false,
        error: "Nessun materiale accumulato. Manda foto e/o testi.",
      };
    }

    return { valid: true };
  },

  // Valida le dimensioni del file prima del download (basato su Content-Length)
  validateDownloadSize(contentLength) {
    if (!contentLength) return { valid: true }; // skip se non disponibile

    const fileSizeMB = contentLength / (1024 * 1024);
    if (fileSizeMB > VALIDATION_CONFIG.MAX_FILE_SIZE_MB) {
      return {
        valid: false,
        error: `File troppo grande (${fileSizeMB.toFixed(1)}MB). Max: ${VALIDATION_CONFIG.MAX_FILE_SIZE_MB}MB`,
      };
    }

    return { valid: true };
  },

  // Resetta il cooldown per una chat (utile per test/debug)
  resetGenerateCooldown(chatId) {
    lastGenerateTime.delete(chatId);
    logger.debug(`Cooldown /genera resettato per chat ${chatId}`);
  },

  // Ritorna i limiti attuali (utile per logging)
  getLimits() {
    return VALIDATION_CONFIG;
  },
};
