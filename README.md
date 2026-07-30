# Effatá Social Automation

Automazione per trasformare foto + brevi racconti mandati dai volontari in bozze pronte per social, blog e Reel, usando Claude API.

## Come funziona
1. I volontari mandano foto (anche più di una, anche come file/documento) e testi al bot Telegram dedicato dell'associazione (niente numeri personali, niente WhatsApp), nel gruppo autorizzato. Il bot conferma ogni foto/testo ricevuto e li accumula in memoria.
2. Quando il materiale per una storia è completo, si scrive il comando `/genera` nel gruppo.
3. Claude analizza tutte le foto e i testi insieme (una sola chiamata API, non una per foto) e genera cinque contenuti: post Facebook, storia Instagram, post LinkedIn, bozza per il blog (titolo + corpo), script per Reel/TikTok.
4. Il risultato finisce in `output/` (le foto + cinque file `.txt`) e il bot conferma nella chat con l'elenco dei file.
5. Un volontario apre i file, sceglie testo/foto per canale e pubblica (o programma) da Meta Business Suite / sito / LinkedIn — la pubblicazione resta manuale per avere sempre un controllo umano finale prima che qualcosa vada online.

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

### Automazione pubblicazione con approvazione umana (prossimo grande step)
L'idea: caricare più materiale per più post/canali, farli comparire già pronti in un calendario, ma mantenere sempre un'approvazione umana esplicita prima della pubblicazione effettiva — niente pubblicazione automatica "cieca".

Come farlo senza costruire un sistema di approvazione da zero: usare le funzionalità native delle piattaforme.
- **Facebook**: creare l'app su Meta for Developers, collegarla alla pagina, ottenere un token a lungo termine. Il bot chiama la Graph API (`POST /{page-id}/feed`) con `published: false` per creare il post come **bozza non pubblicata** — finisce direttamente nel Planner di Meta Business Suite. Un volontario apre Business Suite (come fa già oggi) e clicca "Pubblica"/"Programma": quello resta il passaggio di autorizzazione.
- **Instagram**: la Content Publishing API storicamente ha limitazioni sulla creazione di bozze/programmazione per app di terze parti (spesso richiede pubblicazione immediata) — da verificare bene in fase di sviluppo cosa è realmente disponibile oggi; potrebbe restare necessario passare dall'interfaccia di Business Suite per questo canale.
- **Blog**: se il sito (effataitalia.it) gira su WordPress, si può creare il post come bozza via WP REST API, pubblicata poi manualmente dal pannello WordPress.
- **LinkedIn**: API più burocratica, richiede approvazione specifica da LinkedIn per pubblicare su pagine aziendali — valutare per ultimo.

Non è un lavoro piccolo: serve creare e configurare l'app Meta for Developers, gestire i token (con refresh periodico), e gestire una coda di più post/canali in attesa di approvazione. Da trattare come blocco di sviluppo dedicato, non come estensione rapida.

### Altri miglioramenti possibili
- Aggiungere uno storico/dashboard delle bozze generate.
- Spostare l'esecuzione su un piccolo server cloud (es. Railway, Render) così non serve un PC sempre acceso.
- Gestire il caso di più "storie" in corso in parallelo nello stesso gruppo (oggi il materiale accumulato con `/genera` è unico per chat, non per storia).

## Nota su privacy e minori
Il progetto tratta foto e storie di minori a scopo di raccolta fondi. Prima di pubblicare, verificate sempre che ci sia il consenso della famiglia/tutore alla diffusione dell'immagine e che non vengano condivisi dettagli identificativi non necessari (indirizzo esatto, cognome completo, scuola specifica), in linea con le buone prassi di child safeguarding delle ONG.
