# Effatá Social Automation

Automazione per trasformare foto + brevi racconti mandati dai volontari in bozze pronte per social, blog e Reel, usando Claude API.

## Panoramica

Questo bot Telegram aiuta i volontari di Effatá a generare contenuti multicanale da una singola fonte di testo + foto:

- **Input**: volontari mandano foto (una o più) e testi brevi al bot Telegram
- **Processo**: Claude analizza foto + testi insieme e genera automaticamente 5 formati diversi
- **Output**: bozze pronte in `output/` — testo per Facebook, Instagram, LinkedIn, blog, Reel/TikTok
- **Controllo**: la pubblicazione rimane manuale, così un volontario verifica sempre prima di andare online

Niente automatismo cieco: il sistema genera, il team valida.

## Flusso di lavoro

```
Volontario               Bot Telegram              Claude API          output/
    │
    ├──── Foto 1 ─────────────→ [accumulata in memoria]
    │
    ├──── Foto 2 ─────────────→ [accumulata in memoria]
    │
    ├──── Testo 1 ────────────→ [accumulato in memoria]
    │
    └──── /genera ──────────────→ ✓ Chiama Claude con tutte le foto + testi → [salva 5 file + foto]
                                                                          ✓ Conferma nella chat
```

**Step di dettaglio**:
1. Volontari mandano foto (compresse o come file/documento) e testi brevi al gruppo Telegram privato
2. Bot conferma ogni ricezione e accumula in memoria
3. Quando il materiale è completo, scrivono `/genera` nel gruppo
4. Claude processa tutto in un'unica chiamata e genera:
   - Post Facebook (caldo, discorsivo, con CTA)
   - Storia Instagram (breve, d'impatto)
   - Post LinkedIn (tono istituzionale, per partner/donor)
   - Blog (titolo + 4-6 paragrafi)
   - Script Reel/TikTok (30-45 secondi di parlato)
5. File + foto vanno in `output/` con timestamp
6. Volontario apre i file, sceglie il testo per canale e pubblica manualmente via Meta Business Suite / WordPress / LinkedIn

## Architettura

```
src/
├── index.js               # Entry point, carica .env e avvia il bot
├── telegramBot.js         # Gestione bot (ricezione foto/testi, accumulo, comando /genera)
└── generateContent.js     # Integraizone Claude API, generazione contenuti
```

**Flusso interno**:
- `index.js` → `startBot()` che rimane in ascolto via polling
- Ricezione foto → `addImageToPending()` scarica e salva in `intake/`, accumula in memoria
- Ricezione testo → accumula in `pendingByChat` (map chat → foto + testi)
- `/genera` → carica foto + testi, chiama `generateSocialContent()`, salva output

## Setup

### 1. Prerequisiti
- Node.js 16+ (verificare con `node --version`)
- Telegram installato (per configurare il bot)
- Un account Anthropic con accesso all'API

### 2. Crea il bot Telegram
1. Apri Telegram, cerca `@BotFather`
2. Scrivi `/newbot`, segui le istruzioni
3. Copia il token generato (es. `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)
4. Crea un gruppo Telegram privato (es. "Contenuti Social Effatá")
5. Aggiungi il bot al gruppo
6. **Importante**: mandagli un messaggio di prova per attivarlo

### 3. Prendi una chiave API Anthropic
1. Vai su https://console.anthropic.com
2. Accedi o registrati
3. Sezione "API Keys", crea una nuova chiave
4. Copila (avrà forma `sk-ant-...`)

### 4. Configura il progetto
```bash
# Clona o scarica il progetto
cd social_effata

# Installa dipendenze
npm install

# Copia il template di configurazione
cp .env.example .env

# Apri .env e compila:
# TELEGRAM_BOT_TOKEN=<token di BotFather>
# ANTHROPIC_API_KEY=<chiave API Anthropic>
# ALLOWED_CHAT_ID=<verrà impostato al primo avvio>
```

### 5. Avvia il bot e scopri il chat ID
```bash
npm start
```

Vedrai nel terminale:
```
Bot Telegram avviato, in ascolto...
Messaggio ricevuto da chat ID: -1001234567890 (Contenuti Social Effatá)
```

Copia l'ID (che inizia con `-100...` per i gruppi), aggiungilo in `.env`:
```
ALLOWED_CHAT_ID=-1001234567890
```

Riavvia il bot:
```bash
npm start
```

Ora solo quel gruppo può usare il bot.

## Variabili d'ambiente

```bash
# Token Telegram da @BotFather (obbligatorio)
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11

# Chiave API Anthropic (obbligatorio)
ANTHROPIC_API_KEY=sk-ant-...

# ID della chat Telegram autorizzata (obbligatorio)
# Se non impostato, qualsiasi chat può usare il bot
# Scopri l'ID al primo avvio con npm start
ALLOWED_CHAT_ID=-1001234567890
```

## Comandi del bot

### `/genera`
Genera i contenuti da tutte le foto + testi accumulati.

**Prerequisiti**:
- Almeno 1 foto deve essere stata mandata
- I testi sono opzionali

**Output**:
- 5 file di testo (Facebook, Instagram, LinkedIn, blog, Reel)
- Copie delle foto originali (numerati `_1`, `_2`, ecc.)
- Tutti in cartella `output/` con timestamp
- Il materiale accumulato viene pulito (sia dalla memoria che dai file temporanei)

**Esempio nella chat**:
```
📥 Genero le bozze da 2 foto e 1 testi extra...
[Claude processa...]
✅ Bozze pronte in output/1704067200000_*.txt
```

### `/status`
Mostra quante foto e quanti testi sono accumulati in attesa di `/genera`.

**Esempio**:
```
📋 Materiale accumulato:
• 2 foto
• 1 testi extra
```

### `/reset`
Cancella tutto il materiale accumulato (foto e testi) e i file temporanei. Utile se vuoi iniziare da capo senza generare.

**Esempio**:
```
✅ Materiale cancellato. Puoi iniziare una nuova storia.
```

### Ricezione foto
- Foto compressa (tramite Telegram): scaricata come JPEG, aggiunta al materiale
- Foto come file (es. PNG ad alta risoluzione): accettata, aggiunta al materiale
- Caption opzionale: salvata come testo descrittivo

Conferma:
```
📥 Foto aggiunta (3 in attesa). Manda altre foto/testi, oppure scrivi /genera quando hai finito.
```

### Ricezione testo
Qualunque messaggio di testo (non comando) viene accumulato.

Conferma:
```
📝 Testo aggiunto al materiale in attesa.
```

## Output

Dopo `/genera`, in `output/` troverai:

```
output/
├── 1704067200000_facebook.txt      # Post Facebook
├── 1704067200000_instagram.txt     # Story Instagram
├── 1704067200000_linkedin.txt      # Post LinkedIn
├── 1704067200000_blog.txt          # Titolo + corpo blog
├── 1704067200000_reel.txt          # Script Reel/TikTok
├── 1704067200000_1.jpg             # Foto originale 1
└── 1704067200000_2.png             # Foto originale 2
```

**Formato file di testo**:
```
<testo grezzo, non formattato>
```

Ogni file è pronto da copiare/incollare nella piattaforma corrispondente, oppure da aprire e modificare prima di pubblicare.

## Struttura directory

```
social_effata/
├── src/                   # Codice sorgente
│   ├── index.js           # Entry point
│   ├── telegramBot.js     # Logica bot e handler messaggi
│   ├── generateContent.js # Integrazione Claude API
│   ├── logger.js          # Sistema di logging (console + file)
│   └── validation.js      # Validazione input e rate limiting
├── intake/                # Foto temporanee ricevute (cancellate dopo /genera)
├── output/                # File finali generati
├── logs/                  # File di log (app.log, archiviati per rotazione)
├── state.json             # Stato persistente (foto + testi accumulati)
├── .env                   # Variabili d'ambiente (locale, non in git)
├── .env.example           # Template .env
├── .gitignore             # Esclusioni git
├── package.json
└── README.md
```

**Note**:
- `state.json` salva il materiale accumulato — se il bot crasha, al riavvio il materiale viene recuperato
- `intake/` viene pulito quando viene inviato `/genera` (files temporanei cancellati, non salvati in git)
- `output/` accumula i risultati finali — ordina per timestamp
- `.env` non va mai in git (contiene chiavi segrete)

## Dashboard Web

Il bot include una **dashboard web** moderna per visualizzare le bozze generate, approvarle e scaricarle.

### Accedere alla dashboard

Quando il bot è in esecuzione:

```bash
npm start
```

Apri il browser a **`http://localhost:3000`**

### Funzionalità

- 📋 **Elenco bozze**: visualizza tutte le bozze generate con data e formati disponibili
- 👁️ **Visualizzazione**: leggi il testo di Facebook, Instagram, LinkedIn, blog, Reel/TikTok
- 🖼️ **Foto**: guarda le foto associate a ogni bozza
- 📱 **Responsive**: funziona su desktop, tablet, mobile
- 🎨 **Interfaccia moderna**: dark gradient, animazioni smooth

### Screenshot (concetti)

```
┌─────────────────────────────────────────┐
│ 📱 Effatá Social Dashboard              │
│ Visualizza, approva e scarica...        │
└─────────────────────────────────────────┘

┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Bozza #1234  │  │ Bozza #5678  │  │ Bozza #9999  │
│ 31 lug 2026  │  │ 30 lug 2026  │  │ 29 lug 2026  │
│ 📘 📷 💼 📝  │  │ 📘 📷 💼    │  │ 🎬 📘 📷    │
│ [Visualizza] │  │ [Visualizza] │  │ [Visualizza] │
└──────────────┘  └──────────────┘  └──────────────┘

[Click per aprire]
┌─────────────────────────────────────────┐
│ Bozza #1234 (31 lug 2026)               │
├─────────────────────────────────────────┤
│ [Facebook] [Instagram] [LinkedIn] ...   │
├─────────────────────────────────────────┤
│ Post Facebook:                          │
│ ═════════════════════════════════════   │
│ "Ciao mondo! Oggi vi raccontiamo..."    │
│                                         │
│ [Copy to clipboard]                     │
└─────────────────────────────────────────┘
```

### API disponibili

```bash
# Listare tutte le bozze
GET /api/drafts

# Ottenere il contenuto di una bozza
GET /api/drafts/:id/facebook
GET /api/drafts/:id/instagram
GET /api/drafts/:id/linkedin
GET /api/drafts/:id/blog
GET /api/drafts/:id/reel

# Listare le foto di una bozza
GET /api/drafts/:id/photos

# Servire le foto
GET /output/:filename
```

### Configurazione porta

Per cambiare la porta (default 3000):

```bash
PORT=8080 npm start
```

## Logging

Il bot registra tutte le operazioni in **console** (con colori) e in un **file di log** (`logs/app.log`). Questo è utile per:

- Debuggare problemi
- Tracciare la cronologia delle operazioni
- Verificare il consumo di token API
- Monitorare errori

### Livelli di log

- **DEBUG** (cyan): dettagli di debugging (messaggi ricevuti, stato salvato)
- **INFO** (verde): operazioni importanti (bot avviato, materiale accumulato)
- **WARN** (giallo): problemi non critici (fallback JSON, file non trovati)
- **ERROR** (rosso): errori significativi (API down, parsing fallito)

### File di log

```
logs/
└── app.log              # Log principale (rotato a 10MB)
```

Quando il file supera 10MB, viene archiviato con timestamp: `app.log.2026-07-31.1704067200000`

### Lettura dei log

Nel terminale, cerca un'operazione specifica:
```bash
grep "Foto aggiunta" logs/app.log
grep "ERROR" logs/app.log
```

Oppure guarda gli ultimi messaggi in tempo reale:
```bash
tail -f logs/app.log
```

## Persistenza dello stato

Il bot **salva automaticamente** il materiale accumulato (foto + testi) in un file `state.json`. Questo significa:

- **Se il bot crasha** prima di `/genera`, al riavvio il materiale è ancora lì — non si perde
- **Se riavvii il bot** per aggiornare il codice, il materiale viene recuperato
- **Il file `state.json`** non va in git (è nel `.gitignore`) — rimane locale su ogni machine

### Come funziona

1. Al primo avvio, il bot carica lo stato da `state.json` (se esiste)
2. Ogni volta che ricevi una foto o un testo, lo stato viene salvato automaticamente
3. Quando invii `/genera`, il materiale viene processato e **cancellato** sia dallo stato che dai file temporanei
4. Se cancelli il file `state.json`, il bot ricomincia da zero

### Se perdi materiale

Se per qualche motivo il materiale scompare:
- Verifica che `state.json` esista nella root del progetto
- Se il bot crasha durante una operazione, potrebbe rimanere in uno stato intermedio
- Usa `/reset` per pulire completamente e iniziare da capo

## Validazione e limiti

Il bot valida tutti gli input per proteggere da errori e abuse. Ecco i limiti:

| Risorsa | Limite | Motivo |
|---------|--------|--------|
| **Foto per storia** | Max 10 | Evita di overload Claude e memoria |
| **Dimensione foto** | Max 25MB | Limiti Telegram + efficienza API |
| **Formato foto** | JPEG, PNG, WebP, GIF | Formati supportati da Claude |
| **Testo singolo** | Max 5.000 char | Legibilità messaggi Telegram |
| **Testo totale** | Max 50.000 char | Limiti token input Claude |
| **Rate limiting** | 30s tra `/genera` | Protezione da abuse |

### Messaggi di validazione

Quando un limite viene raggiunto, il bot informa esplicitamente:

```
Volontario invia foto 30MB
Bot risponde: ⚠️ Foto troppo grande (30.0MB). Max: 25MB
→ La foto NON viene salvata

Volontario invia 10 foto, poi manda l'11esima
Bot risponde: ⚠️ Limite di foto raggiunto (10 max). Genera ora con /genera.
→ La foto NON viene salvata finché non fa /genera

Volontario invia testo di 60k caratteri (troppo lungo)
Bot risponde: ⚠️ Testo troppo lungo (60000 char). Max: 50000
→ Il testo NON viene aggiunto

Volontario scrive /genera due volte in 10 secondi
Primo /genera: ✅ elabora
Secondo /genera (dopo 10s): ⏱️ Aspetta 20s prima di generare di nuovo.
→ Il secondo /genera viene bloccato
```

### Come comportarsi

- **Foto troppo grande**: usa uno strumento per ridurre la risoluzione (es. Compressor.io, ImageMagick, oppure salva da smartphone)
- **Limite foto raggiunto**: scrivi `/genera` per processare quello che hai, poi ricomincia con una nuova storia
- **Testo troppo lungo**: dividi la storia in più parti e genera separatamente (es. "Storia 1" e "Seguito")
- **Rate limiting**: attendi il tempo indicato prima di generare di nuovo (protezione da abuse accidentali)

## Troubleshooting

### "Manca TELEGRAM_BOT_TOKEN nel file .env"
- Verificare che `.env` esista nella root del progetto
- Controllare che `TELEGRAM_BOT_TOKEN=<token>` sia compilato (senza spazi)
- Riavviare con `npm start`

### "Il bot non riceve messaggi"
- Verificare che il bot sia stato aggiunto al gruppo Telegram
- Verificare che il gruppo sia **privato** (non pubblico)
- Se `ALLOWED_CHAT_ID` è impostato, verificare che sia l'ID corretto
- Nel terminale dovrebbe vedersi "Bot Telegram avviato, in ascolto..." — se non appare, c'è un errore di token

### "/genera dice 'Non ho ancora ricevuto nessuna foto'"
- Verificare che almeno una foto sia stata mandata **prima** di `/genera`
- Una foto "compressa" via Telegram non è la stessa cosa di un file — sprovare con entrambi

### "Claude genera testo con markdown ```` ``` ````"
- Questo è raro e il bot filtra i triple backtick
- Se succede ancora, il testo è comunque usabile — bastano le parti tra i backtick

### "Le foto vengono caricate ma Claude non sembra averle viste"
- Verificare che le foto abbiano formato supportato (JPEG, PNG, WebP, GIF)
- Se la foto è molto grande (>20MB), potrebbe esserci un timeout
- Provare con foto di dimensione normale (es. da smartphone)

### "Il bot va in crash con 'Errore nel generare i contenuti'"
- Controllare che `ANTHROPIC_API_KEY` sia valida (potrebbe essere scaduta o revocata)
- Controllare il limite di token API (se superato, l'API blocca)
- Provare con foto/testi più brevi per ridurre i token
- Leggere l'errore nel terminale per dettagli

### "Devo riavviare il PC / il bot crasha e perdo il materiale accumulato"
- Il materiale vive solo in memoria — non è salvato
- Sì, se il bot crasha prima di `/genera`, il materiale va perso
- Soluzione futura: salvare il materiale in un database

## Test automatici

Il progetto usa **Jest** per test automatici. Coverage attuale: **50%+** (validation, logger, generateContent).

### Eseguire i test

```bash
# Esegui tutti i test una volta
npm test

# Modalità watch (esegui di nuovo al salvataggio file)
npm run test:watch

# Coverage report
npm run test:coverage
```

### Struttura test

```
__tests__/
├── validation.test.js       # 24 test per validazione input
├── logger.test.js           # 8 test per logging
└── generateContent.test.js  # 2 test per API Claude
```

### Cosa è testato

- **validation.js**: formato foto, dimensioni, lunghezze testo, rate limiting, cooldown
- **logger.js**: output file, timestamp ISO, livelli log, multi-line
- **generateContent.js**: import funzione, signature parametri

### Cosa NON è testato (per ora)

- **telegramBot.js**: complesso, richiede mock Telegram API (future improvement)
- Integrazione end-to-end: richiede bot vero + Telegram + Claude API

### Aggiungere nuovi test

Crea file in `__tests__/nomedel-modulo.test.js`:

```javascript
describe("modulo", () => {
  test("comportamento specifico", () => {
    expect(funzione()).toBe(valore_atteso);
  });
});
```

Esegui `npm test` per verificare.

## Sviluppo

### Modificare i limiti di validazione

I limiti sono definiti in `src/validation.js` nella costante `VALIDATION_CONFIG`:

```javascript
const VALIDATION_CONFIG = {
  MAX_FILE_SIZE_MB: 25,           // Aumenta per file più grandi
  MAX_TOTAL_PHOTOS: 10,           // Aumenta per più foto per storia
  MAX_TEXT_LENGTH: 50000,         // Aumenta per testi più lunghi
  MAX_MESSAGE_LENGTH: 5000,       // Aumenta per messaggi singoli più lunghi
  GENERATE_COOLDOWN_SECONDS: 30,  // Aumenta per un cooldown più lungo
};
```

**Attenzione**: aumentare questi limiti comporta:
- Più tempo di elaborazione
- Più token API consumati
- Più memoria utilizzata
- Possibili timeout

### Aggiungere un nuovo formato di output
In `generateContent.js`, modifica:
1. `SYSTEM_PROMPT`: aggiungi una descrizione del nuovo formato (es. "6. Un testo per TikTok...")
2. La risposta JSON deve includere il nuovo campo (es. `"tiktokText": "..."`)
3. In `telegramBot.js`, nel comando `/genera`, aggiungi:
   ```javascript
   fs.writeFileSync(`${outBase}_tiktok.txt`, result.tiktokText);
   ```

### Aggiungere un nuovo comando
In `telegramBot.js`, aggiungi:
```javascript
bot.onText(/^\/miocomando$/i, async (msg) => {
  if (!isAllowed(msg.chat.id)) return;
  // logica
  await bot.sendMessage(msg.chat.id, "Risposta");
});
```

### Eseguire il bot su un server cloud
Oggi il bot usa polling (chiede a Telegram "hai messaggi?"). Per un server cloud, è più efficiente passare a **webhooks**:
1. Il bot dichiara a Telegram un URL pubblico
2. Telegram manda i messaggi tramite HTTP POST
3. Risparmi richieste (da ~30 al minuto a ~0 in idle)

Libreria `node-telegram-bot-api` supporta i webhooks — da documentare meglio quando serve.

### Gestire più storie in parallelo
Oggi il materiale accumulato è per chat (non per storia). Se tre volontari creano tre storie diverse nello stesso gruppo, si mischiano.

Soluzione futura: usare "thread" o un prefisso (`[storia1]`, `[storia2]`) per separare il materiale per story, oppure creare gruppi separati per story.

## Roadmap e Stato Progetto

### Phase 1: MVP Core (✅ FATTO)
**Generazione contenuti multicanale con controllo umano**

- ✅ Bot Telegram riceve foto + testi
- ✅ Comando `/genera` chiama Claude API
- ✅ Output in file di testo (5 formati)
- ✅ Persistenza stato (niente perdita dati)
- ✅ Logging avanzato (file + console)
- ✅ Validazione input robusti
- ✅ Test automatici (30 test, 50%+ coverage)
- ✅ Dashboard web moderna

**Piattaforme supportate (generazione)**:
- 📘 Facebook (post)
- 📷 Instagram (story overlay)
- 💼 LinkedIn (post aziendale)
- 📝 Blog (titolo + 4-6 paragrafi)
- 🎬 Reel/TikTok (script 30-45 secondi)

**Pubblicazione**: Manuale per tutti (volontario copia dalla dashboard)

---

### Phase 2: Automazione Pubblicazione (⏳ PROPOSTO)

#### Opzione A: Meta API (Facebook + Instagram)
- [ ] Configurare app Meta for Developers
- [ ] Implementare Graph API per pubblicare come bozza
- [ ] Gestione token di lunga durata + refresh
- [ ] Pubblicazione automatica → Business Suite (bozza)
- [ ] Volontario clicca "Pubblica" per andare live

**Effort**: Alto (~12 ore)
**Piattaforme coperte**: Facebook ✅ Instagram ✅
**Altre piattaforme**: Rimangono manuali

#### Opzione B: YouTube Shorts (Testo)
- [ ] Generare script ottimizzato per YouTube Shorts
- [ ] Formato: testo con istruzioni di montaggio
- [ ] Volontario crea video manualmente (foto + voce) e pubblica

**Effort**: Basso (~30 min)
**Output**: Script testuale (come TikTok)
**Pubblicazione**: Manuale

#### Opzione C: Database SQLite (Storico)
- [ ] Salvare metadati bozze in database
- [ ] Query: cerca per data, numero foto, canale
- [ ] Dashboard: elenco storico con filtri
- [ ] Audit trail: chi ha generato, quando, quanti token

**Effort**: Medio (~6 ore)
**Valore**: Tracciabilità, reporting

#### Opzione D: Multiple Storie Parallele
- [ ] Supportare prefissi `[storia1]`, `[storia2]` nel gruppo
- [ ] Separare il materiale accumulato per storia
- [ ] Comando `/lista-storie` per vedere quali sono in corso

**Effort**: Basso (~3 ore)
**Valore**: Gestione migliore se il team cresce

---

### Phase 3: Scaling e Produzione (🚀 LONG-TERM)

#### Infrastruttura
- [ ] Migrare da polling a webhooks Telegram (efficienza)
- [ ] Deployment su server cloud (Railway, Render, AWS)
- [ ] Uptime 99% (niente PC sempre acceso)
- [ ] CI/CD automatico (test + deploy su push)

#### Feature avanzate
- [ ] LinkedIn API (richiede approvazione, burocrazia)
- [ ] TikTok API (limitata, complicata)
- [ ] Video auto-generato per Shorts
  - Text-to-Speech (script → voce)
  - FFmpeg (foto + audio → video)
  - Upload automatico YouTube
- [ ] WordPress integration (pubblicare blog post automaticamente)

#### UX
- [ ] Copy-to-clipboard buttons nella dashboard
- [ ] Anteprima tempo reale nei tabs
- [ ] Dark/light mode selector
- [ ] Download ZIP di una bozza (testo + foto)

---

## Supporto Piattaforme (Matrice)

| Piattaforma | Generazione | Pubblicazione | Note |
|-------------|-------------|---------------|------|
| **Facebook** | ✅ Post | ❌ Manuale | Meta API: possibile (Phase 2) |
| **Instagram** | ✅ Story | ❌ Manuale | Meta API: possibile (Phase 2) |
| **LinkedIn** | ✅ Post | ❌ Manuale | API complessa, richiede approvazione |
| **Blog** | ✅ Articolo | ❌ Manuale | WordPress API: possibile |
| **TikTok** | ✅ Script | ❌ Manuale | API limitata, video serve fare a mano |
| **YouTube Shorts** | ⏳ Script (Phase 2) | ❌ Manuale | Video auto-gen: possibile ma complesso |
| **Telegram** | ✅ Bot riceve | N/A | Canale di input |

---

## Feature Attuali e Prossimi Step

### Completed ✅
- Bot Telegram con ricevimento foto/testi
- Generazione contenuti con Claude (5 formati)
- Persistenza stato (evita perdita dati)
- Validazione input robusta (25+ regole)
- Rate limiting (`/genera` 30s cooldown)
- Logging completo (timestamp + file)
- Test automatici (30 test)
- Dashboard web responsive

### In Progress (scegliete uno)
- **Meta API**: Pubblicazione automatica Facebook/Instagram
- **YouTube Shorts**: Aggiungere script per Shorts
- **SQLite**: Storico bozze + query
- **Multiple storie**: Supportare storie parallele

### Not Started 📋
- Webhooks Telegram (efficienza)
- Cloud deployment (uptime)
- LinkedIn API (burocrazia)
- Video auto-generato (complesso)

---

## Come Scegliere il Prossimo Step

**Criterio: Impatto vs Effort**

| Feature | Impatto | Effort | Priorità |
|---------|---------|--------|----------|
| Meta API | 🔴 Alto | 🔴 Alto | 1️⃣ (automazione completa) |
| YouTube Shorts | 🟡 Medio | 🟢 Basso | 2️⃣ (quick win) |
| SQLite | 🟡 Medio | 🟡 Medio | 3️⃣ (tracciabilità) |
| Multiple storie | 🟡 Medio | 🟢 Basso | 4️⃣ (se team cresce) |
| Cloud deploy | 🟢 Basso | 🟢 Basso | 5️⃣ (affidabilità) |

---

## Prossimo Meeting

**Discutere con il team**:
- Priorità: Meta API o YouTube Shorts o Database?
- Timeline: Quando serve avere x feature?
- Team size: Quanti volontari usano il bot?
- Budget: API costs (Claude vs YouTube vs TikTok)?

## Privacy e minori

**Importante**: questo progetto tratta foto e storie di minori a scopo di raccolta fondi.

Prima di pubblicare, assicurati sempre che:
- ✅ Ci sia il consenso scritto della famiglia/tutore per la diffusione dell'immagine
- ✅ Non vengano condivisi dettagli identificativi non necessari:
  - Cognome completo
  - Indirizzo esatto
  - Nome della scuola specifica
  - Nomi di altri familiari
- ✅ Le foto non mostrino il volto intero o identificabile se non necessario

Queste regole seguono le **buone prassi di child safeguarding** delle ONG internazionali (Save the Children, UNICEF, ecc.) — non sono optional.

Se un volontario manda materiale che viola queste regole, **non generare**. Parla con il team di Effatá prima di procedere.

## Dipendenze

- **@anthropic-ai/sdk**: Client Node.js per l'API Anthropic
- **node-telegram-bot-api**: Wrapper Telegram Bot API
- **dotenv**: Caricamento variabili d'ambiente da file `.env`

Vedi `package.json` per le versioni esatte.

## Licenza

[Da aggiungere]

## Contatti

Per domande o segnalazioni su questo bot, contatta il team dev di Effatá.
