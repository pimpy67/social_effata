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
export const SHARE_CTA_COMMENT = `Condividi questo post e scrivici "${SHARE_KEYWORD}" nei commenti: ti ringrazieremo di persona! 💙`;
