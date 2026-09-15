import { logger } from "./logger.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "../config/moderation-keywords.json");

// Carica le parole chiave dal file di configurazione JSON
function loadKeywordsFromConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
      const keywords = [];

      // Carica da tutte le sezioni del config
      if (config.hate_speech) {
        for (const category of Object.values(config.hate_speech)) {
          if (Array.isArray(category)) {
            keywords.push(...category);
          }
        }
      }

      if (config.custom_additions?.items) {
        config.custom_additions.items
          .filter((item) => !item.includes("AGGIUNGI") && !item.includes("ES:"))
          .forEach((item) => keywords.push(item));
      }

      logger.debug(`Caricate ${keywords.length} parole chiave dalla configurazione`);
      return keywords;
    }
  } catch (err) {
    logger.warn(`Errore nel caricamento config moderazione: ${err.message}`);
  }
  return [];
}

// Converte parole chiave in regex (escape speciali, case-insensitive)
function buildRegexFromKeywords(keywords) {
  return keywords
    .filter((k) => k && k.trim())
    .map((keyword) => {
      try {
        // Escapa i caratteri speciali regex
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // Permette variazioni con spazi aggiuntivi e leetspeak
        const flexible = escaped
          .replace(/a/gi, "[a4@]")
          .replace(/e/gi, "[e3]")
          .replace(/i/gi, "[i1!]")
          .replace(/o/gi, "[o0]")
          .replace(/s/gi, "[s5$]");
        return new RegExp(flexible, "gi");
      } catch (err) {
        logger.warn(`Regex non valida per: ${keyword}`);
        return null;
      }
    })
    .filter(Boolean);
}

const CONFIG_KEYWORDS = loadKeywordsFromConfig();
const DYNAMIC_REGEXES = buildRegexFromKeywords(CONFIG_KEYWORDS);

// Parole chiave hardcoded (base, non cambiano frequentemente)
// Include variazioni con leetspeak e caratteri speciali
const HATE_SPEECH_KEYWORDS = [
  // Razzismo generale
  /razza\s+inferiore/gi,
  /sporchi.*?(migranti|negri|rom|zingari|neri)/gi,
  /invaditori.*?(stranieri|africani|arabi|musulmani)/gi,

  // Violenza sessuale
  /stupr(are|i|o)?/gi,
  /(vengono\s+a|donne)\s+(in\s+italia|qui)\s+(per|a)\s+(stupr|violenta|abusa)/gi,
  /violenza\s+sessuale/gi,

  // Criminalità
  /(negr[i0o]|m0ri?)\s+(rubano|rubare|ladri|criminali)/gi,
  /rom\s+(rubano|rubare|ladri|crimini)/gi,
  /stranieri\s+(crimini|delinquenti|mafiosi)/gi,
  /(migranti|africani|arabi)\s+(vengono.*rubare|rubano|ladri)/gi,

  // Slur razziali (con variazioni)
  /\b(n[3e]gr[01]|n[3e]r0|m0r0|zingaro|gringo)\b/gi,
  /terroni|marocchini\s+(di\s+)?merda/gi,
  /sporco\s+(extracomunitario|straniero|africano)/gi,

  // Discriminazione basata su nazionalità/origine
  /italiani.*?superiori.*(stranieri|africani|arabi)/gi,
  /non.*?italiano.*?non.*?umano/gi,
  /(strani|extra)comunitari.*?invasione/gi,
  /tornate\s+(al\s+)?vostro\s+paese/gi,
  /non\s+appartengono.*?qui/gi,

  // Sessismo esplicito
  /(donne|femmine)\s+(tutte|sono\s+tutte)\s+(puttane|tr0ie|buone\s+a)/gi,
  /stupri\s+collettivi.*?donne/gi,
  /(donne|donne\s+italiane)\s+(violentate|stuprate)/gi,
];

// Keywords che potrebbero essere false positives ma richiedono context check
const SUSPICIOUS_KEYWORDS = [
  /non dovrebbe.*stare qui/gi,
  /non appartengono/gi,
  /invasione/gi,
  /problema.*stranieri/gi,
];

// Calcolo del severity score del commento
function calculateSuspicionScore(text) {
  let score = 0;

  // Check hate speech keywords hardcoded (pesanti)
  for (const regex of HATE_SPEECH_KEYWORDS) {
    const matches = text.match(regex);
    if (matches) {
      score += matches.length * 100; // Hate speech è grave
    }
  }

  // Check parole chiave dinamiche da config
  for (const regex of DYNAMIC_REGEXES) {
    const matches = text.match(regex);
    if (matches) {
      score += matches.length * 100; // Stessa severità
    }
  }

  // Check suspicious keywords (leggeri)
  for (const regex of SUSPICIOUS_KEYWORDS) {
    const matches = text.match(regex);
    if (matches) {
      score += matches.length * 30;
    }
  }

  // Extra points per combinazioni di parole
  if (/(migranti|africani|stranieri|arabi|zingari|rom)/gi.test(text)) {
    if (/(criminali|rubare|stupri|violenza|invasione|problema)/gi.test(text)) {
      score += 50;
    }
  }

  return score;
}

// Classifica il livello di moderazione
function getModerationLevel(score) {
  if (score >= 100) return "BLOCK"; // Blocca immediatamente
  if (score >= 50) return "FLAG"; // Flagga per revisione
  if (score >= 20) return "WATCH"; // Osserva
  return "OK"; // Ok
}

// Funzione principale di moderazione
export function moderateComment(comment) {
  const text = comment.text || "";

  if (!text.trim()) {
    return { status: "OK", score: 0, reason: "Commento vuoto" };
  }

  const score = calculateSuspicionScore(text);
  const status = getModerationLevel(score);

  const result = {
    status,
    score,
    commentId: comment.commentId,
    platform: comment.platform,
    authorId: comment.authorId,
    authorName: comment.authorName,
  };

  // Log in base al livello di severità
  if (status === "BLOCK") {
    logger.warn(
      `[MODERATION BLOCK] ${comment.platform} - ${comment.commentId} - Score: ${score} - Author: ${comment.authorName} (${comment.authorId})`
    );
    logger.debug(`Content: "${text.substring(0, 200)}..."`);
    result.reason = "Contenuto offensivo/razzista/sessista - Bloccato";
  } else if (status === "FLAG") {
    logger.warn(
      `[MODERATION FLAG] ${comment.platform} - ${comment.commentId} - Score: ${score} - Author: ${comment.authorName} (${comment.authorId})`
    );
    logger.debug(`Content: "${text.substring(0, 200)}..."`);
    result.reason = "Possibile contenuto offensivo - Revisione consigliata";
  } else if (status === "WATCH") {
    logger.debug(
      `[MODERATION WATCH] ${comment.platform} - ${comment.commentId} - Score: ${score}`
    );
    result.reason = "Monitorare";
  }

  return result;
}

// Funzione helper per controllare se un commento deve essere elaborato
export function shouldProcessComment(moderationResult) {
  return moderationResult.status !== "BLOCK";
}

// Funzione helper per generare alert email su FLAG
export function shouldSendModerationAlert(moderationResult) {
  return moderationResult.status === "FLAG";
}

// Moderazione avanzata con API OpenAI (opzionale, per maggiore accuratezza)
// Usa la Moderation API di OpenAI per rilevare contenuto offensivo con AI
export async function moderateWithOpenAI(text) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      logger.debug("OpenAI API non configurata, salto moderazione avanzata");
      return null;
    }

    // Nota: ANTHROPIC_API_KEY è per Claude, non per OpenAI Moderation
    // Se hai una chiave OpenAI, usarla per chiamare: https://api.openai.com/v1/moderations
    // Per ora, usiamo solo il filtro locale basato su regex
    return null;
  } catch (err) {
    logger.warn(`Errore nella moderazione OpenAI: ${err.message}`);
    return null;
  }
}

// Coda di revisione per commenti FLAG (salva su file JSON per review manuale)
export async function addToModerationQueue(comment, moderationResult) {
  try {
    // Importa la coda di moderazione se non già caricata
    const { moderationQueue } = await import("./moderationQueue.js");

    const queueEntry = {
      timestamp: new Date().toISOString(),
      commentId: comment.commentId,
      platform: comment.platform,
      author: comment.authorName,
      authorId: comment.authorId,
      text: comment.text,
      postId: comment.postId,
      status: moderationResult.status,
      score: moderationResult.score,
      reason: moderationResult.reason,
      action: "PENDING", // PENDING, APPROVED, REJECTED
    };

    moderationQueue.add(queueEntry);
    return queueEntry;
  } catch (err) {
    logger.error(`Errore nell'aggiungere alla coda di moderazione: ${err.message}`);
    return null;
  }
}
