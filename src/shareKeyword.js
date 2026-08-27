// Parola chiave che chi condivide un post è invitato a scrivere nei commenti per
// ricevere un ringraziamento automatico. Non esiste un modo per rilevare davvero
// una condivisione via API su Facebook/Instagram (bloccato per privacy lato
// piattaforma): questa auto-dichiarazione è l'unico meccanismo realmente
// disponibile. File separato (nessuna dipendenza) per essere importabile sia da
// generateContent.js (CTA nel prompt) sia da metaWebhook.js (riconoscimento nei
// commenti) senza creare un ciclo di import tra telegramBot.js e generateContent.js.
export const SHARE_KEYWORD = "CONDIVISO";

// Testo del PRIMO commento che il bot stesso pubblica (come Pagina) subito dopo
// ogni post Facebook/Instagram, in aggiunta all'eventuale CTA nella didascalia
// (quest'ultima decisa da Claude "quando risulta naturale", quindi non su ogni
// post — il commento invece parte sempre, per garantire che l'invito ci sia
// comunque). Aggiunto il 25/08/2026 su richiesta di Andrea.
export const SHARE_CTA_COMMENT = `Condividi questo post e scrivici "${SHARE_KEYWORD}" nei commenti: ti risponderemo in privato con un pensiero di Silvia 💙`;

// In pratica molti non scrivono la parola esatta richiesta nella CTA, ma varianti
// brevi già osservate ("Fatto", "Condivisa", ecc.). Per evitare falsi positivi
// (es. "fatto" dentro una frase lunga slegata dalla condivisione), queste frasi
// contano solo se corrispondono all'INTERO commento normalizzato, mai come
// sottostringa — a differenza di SHARE_KEYWORD, che resta riconosciuto ovunque
// nel testo (vedi matchesShareConfirmation).
const SHARE_CONFIRMATION_PHRASES = new Set([
  "CONDIVISO",
  "CONDIVISA",
  "HO CONDIVISO",
  "L HO CONDIVISO",
  "GIA CONDIVISO",
  "GIA CONDIVISA",
  "APPENA CONDIVISO",
  "CONDIVISO GRAZIE",
  "OK CONDIVISO",
  "FATTO",
  "GIA FATTO",
  "FATTO GRAZIE",
  "FATTO GRAZIE MILLE",
  "DONE",
]);

// Rimuove accenti, emoji e punteggiatura, poi maiuscolizza e comprime gli spazi:
// "Già fatto! ✅" -> "GIA FATTO", "L'ho condiviso 💙" -> "L HO CONDIVISO".
function normalizeComment(text) {
  return text
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function matchesShareConfirmation(text) {
  if (!text) return false;
  if (text.toUpperCase().includes(SHARE_KEYWORD)) return true;
  return SHARE_CONFIRMATION_PHRASES.has(normalizeComment(text));
}

// Pensieri firmati da Silvia mostrati come risposta di ringraziamento a chi scrive
// la parola chiave di condivisione. Approvati da Andrea il 26/08/2026. Ruotano
// automaticamente una volta a settimana (stessa frase per 7 giorni) tramite
// getWeeklyShareThankYouMessage, nessun intervento manuale richiesto per cambiarli.
const SHARE_THANK_YOU_QUOTES = [
  "Una condivisione è un aiuto che ci fa sentire famiglia, una goccia in un mare che insieme diventa oceano.",
  "Ogni volta che condividi la nostra storia, apri una porta in più: grazie per farla entrare nella tua vita.",
  "Non serve un grande gesto per fare la differenza: basta un clic che porta il nostro cuore un po' più lontano. Grazie di cuore.",
  "Condividere è come tenersi per mano a distanza: grazie per non lasciarci mai soli in questo cammino.",
  "Ogni condivisione è un piccolo seme che semini per noi: grazie per farlo crescere insieme a noi, giorno dopo giorno.",
  "Grazie per aver dato voce alla nostra causa: ogni condivisione è un abbraccio che arriva più lontano di quanto immagini.",
];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function getWeeklyShareThankYouMessage(now = Date.now()) {
  const index = Math.floor(now / WEEK_MS) % SHARE_THANK_YOU_QUOTES.length;
  return `${SHARE_THANK_YOU_QUOTES[index]}\n— Silvia, Effatà Italia ODV`;
}
