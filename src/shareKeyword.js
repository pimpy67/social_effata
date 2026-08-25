// Parola chiave che chi condivide un post è invitato a scrivere nei commenti per
// ricevere un ringraziamento automatico. Non esiste un modo per rilevare davvero
// una condivisione via API su Facebook/Instagram (bloccato per privacy lato
// piattaforma): questa auto-dichiarazione è l'unico meccanismo realmente
// disponibile. File separato (nessuna dipendenza) per essere importabile sia da
// generateContent.js (CTA nel prompt) sia da metaWebhook.js (riconoscimento nei
// commenti) senza creare un ciclo di import tra telegramBot.js e generateContent.js.
export const SHARE_KEYWORD = "CONDIVISO";
