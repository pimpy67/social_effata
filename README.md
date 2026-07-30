# Effatá Social Automation

Automazione per trasformare foto + brevi racconti mandati dai volontari in bozze pronte per Facebook e Instagram, usando Claude API.

## Come funziona
1. I volontari mandano foto + didascalia a un bot Telegram dedicato dell'associazione (niente numeri personali, niente WhatsApp).
2. Lo script salva foto e testo in `intake/`.
3. Claude genera un post Facebook e un testo per storia Instagram.
4. Il risultato finisce in `output/` (immagine + due file .txt) e il bot conferma nella chat.
5. Un volontario copia il testo in Meta Business Suite e pubblica (o programma) il post — 1 minuto di lavoro.

## Setup

### 1. Crea il bot Telegram
- Apri Telegram, cerca `@BotFather`, scrivi `/newbot` e segui le istruzioni.
- Copia il token che ti dà e mettilo in `.env` come `TELEGRAM_BOT_TOKEN`.
- Aggiungi il bot a un gruppo Telegram privato "Contenuti Social Effatá" con i volontari che mandano materiale.

### 2. Prendi una chiave API Anthropic
- Vai su https://console.anthropic.com, crea una API key.
- Mettila in `.env` come `ANTHROPIC_API_KEY`.

### 3. Installa le dipendenze
```bash
npm install
```

### 4. Copia il file di configurazione
```bash
cp .env.example .env
```
E compila i valori.

### 5. Avvia il bot
```bash
npm start
```
Al primo messaggio ricevuto, il terminale stampa l'ID della chat: copialo in `.env` come `ALLOWED_CHAT_ID` e riavvia, così solo quel gruppo può generare contenuti.

## Prossimi passi possibili
- Aggiungere pubblicazione automatica su Meta (Graph API) invece della copia manuale.
- Aggiungere uno storico/dashboard delle bozze generate.
- Spostare l'esecuzione su un piccolo server cloud (es. Railway, Render) così non serve un PC sempre acceso.

## Nota su privacy e minori
Il progetto tratta foto e storie di minori a scopo di raccolta fondi. Prima di pubblicare, verificate sempre che ci sia il consenso della famiglia/tutore alla diffusione dell'immagine e che non vengano condivisi dettagli identificativi non necessari (indirizzo esatto, cognome completo, scuola specifica), in linea con le buone prassi di child safeguarding delle ONG.
