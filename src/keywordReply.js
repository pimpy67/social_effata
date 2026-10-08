import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Risposta pubblica automatica sotto il commento di chi scrive una parola chiave di
// categoria (es. "CASAFAMIGLIA"), con le informazioni su come aiutare. I testi stanno
// in config/keyword-replies.json; una voce resta inattiva finché "enabled" non è true,
// così nulla viene pubblicato prima che il testo sia approvato.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, "..", "config", "keyword-replies.json");
const STATE_FILE = path.join(__dirname, "..", "keyword-reply-state.json");

export function loadKeywordReplies(file = CONFIG_FILE) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return {};
  }
}

export function loadKeywordReplyState(file = STATE_FILE) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return {};
  }
}

export function saveKeywordReplyState(state, file = STATE_FILE) {
  fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf-8");
}

// Confronto per parola intera: "info" non deve scattare su "informazioni", "cura"
// non su "sicura". Ignora maiuscole/minuscole e punteggiatura attorno alla parola.
export function matchesWholeKeyword(text, keyword) {
  if (!text || !keyword) return false;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "iu").test(text);
}

export function getKeywordReplyText(keyword, replies) {
  const entry = replies?.[keyword];
  return entry?.enabled && entry.text ? entry.text : null;
}

// Una sola risposta per autore, per parola chiave e per post: se la stessa persona
// scrive più volte la parola non riceve più risposte pubbliche.
export function keywordReplyKey(comment, keyword) {
  return `${comment.platform}:${comment.postId ?? "-"}:${comment.authorId ?? comment.commentId}:${keyword}`;
}

// Tra le voci attive che compaiono come parola intera nel commento vince la più lunga,
// così "CASAFAMIGLIA" ha precedenza su "CASA".
export function findKeywordReply(text, replies) {
  return Object.keys(replies || {})
    .filter((keyword) => keyword !== "_nota")
    .filter((keyword) => getKeywordReplyText(keyword, replies) && matchesWholeKeyword(text, keyword))
    .sort((a, b) => b.length - a.length)[0] ?? null;
}

// Restituisce true se la risposta è stata inviata, false se non c'era nulla da inviare
// (nessuna voce attiva nel commento, già risposto, nessuna API Meta).
export async function sendKeywordReply(
  comment,
  metaAPI,
  { replies = loadKeywordReplies(), state = loadKeywordReplyState(), save = saveKeywordReplyState } = {}
) {
  if (!metaAPI) return false;

  const keyword = findKeywordReply(comment.text, replies);
  if (!keyword) return false;

  const text = getKeywordReplyText(keyword, replies);

  const key = keywordReplyKey(comment, keyword);
  if (state[key]) return false;

  if (comment.platform === "facebook") {
    await metaAPI.replyToFacebookComment(comment.commentId, text);
  } else {
    await metaAPI.replyToInstagramComment(comment.commentId, text);
  }

  state[key] = new Date().toISOString();
  save(state);
  return true;
}
