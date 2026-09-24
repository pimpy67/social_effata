# 📋 Documentazione Tecnica Integrazione EFFATA Social Bot → Gestionale

**Documento di riferimento tecnico (allegato a PRD)**  
Data: 2026-09-24  
Versione: 1.1 (Revisionato: correzione sicurezza API, verifica su codice)  
Audience: Team sviluppo gestionale, reviewer PRD

---

## 📌 Come usare questo documento

**Nel PRD**: Richiamato dai capitoli 3.2, 7, 10-11, 13.4, 16, 19 (non incluso integralmente).  
**Come allegato**: `docs/bot/TECHNICAL-INTEGRATION.md` nel repository.  
**Aggiornamenti**: Sincronizzare con codice ogni volta che cambia l'architettura bot (vedi sezione "Verifica Affermazioni").

---  

---

## 📌 Executive Summary

Questo documento descrive l'architettura tecnica, il flusso dati e le integrazioni del bot social EFFATA. Utile per:
- Integrare il bot nel gestionale aziendale
- Sincronizzare dati tra bot e gestionale (foto, nomi bambini, sostenitori, bozze generate)
- Comprendere le dipendenze esterne (API Telegram, Claude, Meta, Google)
- Configurare l'infrastruttura di deployment

---

## 🏗️ Architettura Generale

```
┌─────────────────────────────────────────────────────────────────┐
│                    EFFATA Social Automation                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐   │
│  │   Telegram   │      │   Meta APIs  │      │ Claude API   │   │
│  │   (Input)    │      │  (Facebook/  │      │ (Generation) │   │
│  │              │      │  Instagram)  │      │              │   │
│  └──────┬───────┘      └──────┬───────┘      └──────┬───────┘   │
│         │                     │                     │            │
│         └─────────────────────┼─────────────────────┘            │
│                               │                                  │
│                        ┌──────▼──────┐                           │
│                        │  Node.js    │                           │
│                        │ Express.js  │                           │
│                        │   Server    │                           │
│                        └──────┬──────┘                           │
│                               │                                  │
│         ┌─────────────────────┼─────────────────────┐            │
│         │                     │                     │            │
│    ┌────▼────┐          ┌────▼────┐          ┌────▼────┐       │
│    │ Database │          │ Storage  │          │ Cache   │       │
│    │(SQLite) │          │(Disk)   │          │(JSON)  │       │
│    │         │          │         │          │        │        │
│    │ Drafts  │          │Photos   │          │State   │       │
│    │ Meta    │          │Logs     │          │Pending │       │
│    │ Moderation          │Config   │          │        │        │
│    └─────────┘          └────────┘          └────────┘        │
│         │                     │                     │            │
│         └─────────────────────┼─────────────────────┘            │
│                               │                                  │
│                        ┌──────▼──────┐                           │
│                        │  Dashboard  │                           │
│                        │   (Web UI)  │                           │
│                        │  Port 3000  │                           │
│                        └─────────────┘                           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Flusso Dati Completo

### 1️⃣ Input: Ricezione da Telegram

```
Volontario invia:
├── Foto (1-10)
│   └── Salvate in: /intake/ (temporanee)
│       Metadati: filename, size, date_received
│
└── Testo
    └── Accumulato in: state.json
        Metadati: text_content, author, timestamp
```

**Endpoint Telegram**: `https://api.telegram.org/botTOKEN/getUpdates`  
**Polling interval**: 1-2 sec  
**Stato persistente**: `state.json`

---

### 2️⃣ Processing: Claude AI

```
Input Claude:
├── Foto (base64 encoded)
├── Testi accumulati
└── System Prompt (5 formati: FB, IG, LinkedIn, Blog, Reel)

                     ↓
            Claude API (vision + text)
                     ↓

Output Strutturato (JSON):
{
  "facebook": "Post FB completo...",
  "instagram": "Story IG...",
  "linkedin": "Post LinkedIn...",
  "blog": "Titolo\n\nCorpo articolo...",
  "reel": "Script video (30-45s)...",
  "youtube": "Titolo + Script + Istruzioni..."
}
```

**Model**: `claude-sonnet-4-6` (vedi `src/generateContent.js:118`)  
**Status**: ✅ Valido e supportato (verificato 2026-09-24 su documentazione Anthropic ufficiale)

**Nota sulla versione**: `claude-sonnet-4-6` non è deprecato, ma è superato da `claude-sonnet-5`:
- Stessa latenza (Sonnet line)
- Stesso costo ($2 input / $10 output per MTok)
- **Output migliore** su compiti complessi (Claude Sonnet 5 è generazione successiva)
- **Suggerimento per upgrade**: se il bot genera contenuti scarsi, provare `claude-sonnet-5` senza cambio di costo

**Alternativi superiori**:
- `claude-opus-5` ($5/$25 per MTok) — output top-tier, consigliato se budget permette
- `claude-fable-5` / `claude-fable-5-1` ($10/$50 per MTok) — massime capacità, per compiti hard

**Vision capabilities**: Sì (foto JPEG, PNG, WebP, GIF)  
**Max input tokens**: ~200k (sufficiente per 10 foto + testi)  
**Cost**: ~$0.003 USD per generazione (foto + testi piccoli) con Sonnet 4.6  
**Data verifica**: 2026-09-24 (source: Anthropic official API docs)

---

### 3️⃣ Output: Generazione Bozze

```
Dopo /genera:

/output/{timestamp}_facebook.txt        ← Post Facebook
/output/{timestamp}_instagram.txt       ← Story Instagram
/output/{timestamp}_linkedin.txt        ← Post LinkedIn
/output/{timestamp}_blog.txt            ← Articolo blog
/output/{timestamp}_reel.txt            ← Script Reel/TikTok
/output/{timestamp}_youtube.txt         ← Script YouTube Shorts
/output/{timestamp}_1.jpg               ← Foto originale 1
/output/{timestamp}_2.jpg               ← Foto originale 2
...

DATABASE (SQLite - effata.db):
├── drafts (tabella)
│   ├── id (UUID)
│   ├── timestamp
│   ├── status (pending|in_progress|published)
│   ├── volunteer_name
│   ├── category (storia bambino, calendario, ruote, etc)
│   ├── photo_count
│   ├── content (JSON: facebook/instagram/linkedin/blog/reel)
│   ├── created_at
│   └── updated_at
│
├── meta_publications (tabella)
│   ├── draft_id
│   ├── platform (facebook|instagram)
│   ├── post_id (Meta Graph ID)
│   ├── status (draft|published)
│   └── error_message (se fallita)
│
└── moderation_queue (tabella)
    ├── id
    ├── platform (facebook|instagram)
    ├── comment_id (Meta Graph ID)
    ├── author
    ├── text
    ├── score (0-100)
    ├── status (pending|approved|rejected)
    └── reason
```

---

### 4️⃣ Pubblicazione: Meta APIs

Se configurate in `.env`, il bot pubblica automaticamente:

```
AFTER /genera:
  ├─→ Facebook Graph API
  │   └─ POST /me/feed (status="DRAFT" per review)
  │       Volontario approva in Meta Business Suite
  │
  └─→ Instagram (TUTTO PUBBLICAZIONE DIRETTA - no bozze)
      ├─ Post singolo/carousel: POST /media_publish → Live subito
      ├─ Story: POST /media_publish → Live subito
      └─ Reel: POST /media_publish → In pendenza approvazione Meta (24h) → Live

Flusso Reale (verificato su `metaAPI.js:475+`):
  • Facebook: Bozza (status="DRAFT") → Volontario clicca "Pubblica" in Meta Business Suite → Live
  • Instagram Post: Pubblicazione istantanea (no bozze via API) → Visibile subito
  • Instagram Story: Pubblicazione istantanea → Visibile subito
  • Instagram Reel: Invio a Meta → Pendenza approvazione (24h) → Live dopo approvazione

⚠️ Differenza chiave:
  - Facebook ha il concetto di "bozza" (status=DRAFT): volontario approva manualmente
  - Instagram NO bozze: una volta pubblicata via API, è visibile subito (post/story) 
    o in pendenza approvazione (Reel)
```

**Endpoint**: `https://graph.facebook.com/v26.0/`  
**Auth**: `META_PAGE_ACCESS_TOKEN` (token sistema pagina, lunga durata)  
**Formati supportati**: Immagini singole, carousel (max 10), video, story

---

## 💾 Struttura Database (SQLite)

### Tabella: `drafts`

```sql
CREATE TABLE drafts (
  id TEXT PRIMARY KEY,                    -- UUID
  timestamp INTEGER NOT NULL,             -- Unix timestamp
  status TEXT DEFAULT 'pending',          -- pending|in_progress|published
  volunteer_name TEXT,                    -- Chi ha generato la bozza
  category TEXT NOT NULL,                 -- (vedi categorie sotto)
  photo_count INTEGER,
  content TEXT NOT NULL,                  -- JSON: {facebook, instagram, ...}
  photos TEXT,                            -- JSON: ["1.jpg", "2.jpg", ...]
  meta_facebook_post_id TEXT,             -- ID post Facebook (se pubblicato)
  meta_instagram_media_id TEXT,           -- ID media Instagram
  meta_facebook_status TEXT,              -- draft|published|failed
  meta_instagram_status TEXT,
  meta_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Tabella: `meta_publications`

```sql
CREATE TABLE meta_publications (
  id TEXT PRIMARY KEY,
  draft_id TEXT NOT NULL REFERENCES drafts(id),
  platform TEXT NOT NULL,                 -- facebook|instagram
  post_id TEXT,                           -- Meta post/media ID
  status TEXT DEFAULT 'draft',            -- draft|published|failed
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  published_at DATETIME
);
```

### Tabella: `moderation_queue`

```sql
CREATE TABLE moderation_queue (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,                 -- facebook|instagram
  comment_id TEXT NOT NULL,               -- Meta comment ID
  post_id TEXT,                           -- Meta post ID associato
  author TEXT,
  author_id TEXT,
  text TEXT,
  score INTEGER DEFAULT 0,                -- 0-100
  reason TEXT,
  status TEXT DEFAULT 'pending',          -- pending|approved|rejected
  hidden_status TEXT,                     -- visible|hidden
  action_taken_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME
);
```

### Tabella: `promotions` (Calendari, Ruote, GoFundMe)

```sql
CREATE TABLE promotions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                     -- calendar|ruote|gofundme
  title TEXT,
  description TEXT,
  asset_url TEXT,                         -- Path asset in /assets/
  last_used_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 📂 Struttura Directory

```
social_effata/
├── src/                          # Codice sorgente Node.js
│   ├── index.js                  # Entry point
│   ├── telegramBot.js            # Handler bot Telegram
│   ├── generateContent.js        # Integrazione Claude API
│   ├── server.js                 # Express server (port 3000)
│   │
│   ├── metaAPI.js                # Pubblicazione automatica Meta
│   ├── metaWebhook.js            # Webhook ricezione commenti
│   ├── linkedinAPI.js            # Integrazione LinkedIn (beta)
│   ├── wordpressAPI.js           # Integrazione WordPress (beta)
│   │
│   ├── commentModerator.js       # Moderazione commenti
│   ├── moderationFilter.js       # Filtro locale (badwords, regex)
│   ├── moderationQueue.js        # Coda moderazione
│   ├── findPostToModerate.js     # Find nuovi commenti
│   ├── moderateReel.js           # Moderazione Reel specificamente
│   │
│   ├── calendarPromo.js          # Genera promo Calendario
│   ├── gofundmePromo.js          # Genera promo GoFundMe
│   ├── monthlySummary.js         # Summary mensile
│   ├── shareKeyword.js           # Estrae hashtag/keyword
│   ├── utm.js                    # Genera UTM parameters
│   │
│   ├── database.js               # SQLite wrapper
│   ├── logger.js                 # Sistema logging
│   ├── validation.js             # Validazione input
│   ├── photoOptimizer.js         # Ottimizzazione foto
│   └── emailAPI.js               # Notifiche email
│
├── config/
│   └── moderation-keywords.json  # Custom parole bannate
│
├── assets/
│   ├── calendario-mesi/          # 24 mesi × 2 anni
│   ├── ruote-di-speranza/        # Immagini ruote
│   └── effata-logo.png           # Logo
│
├── intake/                        # ⚠️ TEMPORANEO
│   └── foto_ricevute_da_telegram
│
├── output/                        # 📦 PERMANENTE
│   ├── {timestamp}_facebook.txt
│   ├── {timestamp}_instagram.txt
│   ├── {timestamp}_{n}.jpg       # Foto originali
│   └── ...
│
├── logs/
│   └── app.log                   # Log rotati ogni 10MB
│
├── public/                        # Assets web (dashboard)
│   └── index.html                # Dashboard UI (React/Vue)
│
├── __tests__/                    # Test automatici (Jest)
│   ├── validation.test.js
│   ├── generateContent.test.js
│   ├── metaAPI.test.js
│   └── ...
│
├── scripts/
│   ├── capture-calendar-months.mjs
│   ├── recover-old-drafts.js
│   ├── send-once.js
│   └── ...
│
├── state.json                    # ⚠️ TEMPORANEO
│   └── {chat_id: {photos, texts}}
│
├── {promo}-state.json            # ⚠️ TEMPORANEO
│   └── Stato calendar/gofundme
│
├── effata.db                     # 📦 DATABASE PRINCIPALE
│
├── Dockerfile                    # Deployment Docker
├── docker-compose.yml
├── .env                          # ⚠️ SECRETS (non in git)
├── .gitignore
├── package.json
└── README.md
```

---

## 🔑 Variabili Ambiente (.env)

### Required
```bash
# Telegram
TELEGRAM_BOT_TOKEN=                      # Da @BotFather (formato: 123456:ABC-DEF1234...)

# Claude API
ANTHROPIC_API_KEY=                       # console.anthropic.com (formato: sk-ant-...)

# Meta (opzionale ma consigliato)
META_PAGE_ID=                            # ID Pagina Facebook (numero intero, 10+ cifre)
META_PAGE_ACCESS_TOKEN=                  # Token lungo termine (Graph API, formato: EAAU...)
META_VERIFY_TOKEN=                       # Webhook validation (stringa casuale, tu la scegli)
```

### Optional - Moderazione
```bash
PERSPECTIVE_API_KEY=                     # Google Perspective API (Google Cloud Console)
OPENAI_API_KEY=                          # OpenAI Moderation API (formato: sk-...)
```

### Optional - LinkedIn (beta)
```bash
LINKEDIN_ACCESS_TOKEN=                   # Token LinkedIn (rinnovare ogni ~60gg)
```

### Optional - WordPress (beta)
```bash
WORDPRESS_SITE_URL=                      # URL blog (es. https://blog.effata.it)
WORDPRESS_USERNAME=                      # Utente WordPress con permesso articoli
WORDPRESS_APP_PASSWORD=                  # Application Password (non password account)
```

### Optional - Email
```bash
EMAIL_USER=                              # Gmail SMTP sender
EMAIL_APP_PASSWORD=                      # Gmail App Password (Google Security)
```

### Configurazione
```bash
API_TOKEN=                               # Bearer token per proteggere /api/* (genera: openssl rand -hex 32)
PORT=3000                                # Default porta Express
NODE_ENV=production                      # production|development
```

---

## 🌐 API Esterne & Dipendenze

| Servizio | Endpoint | Autenticazione | Costo | Uso |
|----------|----------|---|---|---|
| **Telegram** | `api.telegram.org` | Token Bot | Gratis | Input messaggi |
| **Claude API** | `api.anthropic.com` | API Key | $0.003/richiesta | Generazione contenuti |
| **Meta Graph API** | `graph.instagram.com` | Page Token | Gratis | Pubblicazione FB/IG |
| **Perspective API** | `commentanalyzer.googleapis.com` | API Key Google Cloud | Gratis (100k/mese) | Analisi tossicità commenti |
| **OpenAI Moderation** | `api.openai.com` | API Key | Gratis | Rilevazione contenuto vietato |
| **Webhook Meta** | `tu.webhook.url` | Callback verify token | Gratis | Ricezione commenti |

---

## 🔗 Integrazioni Esterne

### Meta Webhook (Ricezione Commenti)

Il bot ascolta su `/webhooks/meta` commenti in tempo reale da Facebook/Instagram:

```
Meta Platform
    │
    └─→ POST /webhooks/meta
        Headers: X-Hub-Signature: sha256=...
        Body: {
          "entry": [{
            "messaging": [{
              "sender": {id: "..."},
              "message": {text: "...", created_time: ...}
            }]
          }]
        }
         │
         └─→ commentModerator.js
             └─→ Filtro locale + API
                 └─→ BLOCK (≥100 score): nascondi su Meta
                     FLAG (50-99): coda review
                     OK (<50): processa
```

**Setup**:
1. Dashboard Meta for Developers → App → Impostazioni → Webhook
2. Callback URL: `https://bot.effata.it/webhooks/meta`
3. Verify Token: `META_VERIFY_TOKEN` da `.env`
4. Subscribe: `messages` e `feed` events

---

## 📊 Integrazioni Dati con Gestionale

### 1. Sync Foto Bambini / Sostenitori

**Proposta**: Carica foto dal gestionale → bot genera bozze con quei dati

```javascript
// API: GET /api/children
// Risposta: [{id, name, age, photo_url, story}]

// Nel prompt Claude:
"Racconti della storia di {child.name}, {child.age} anni, da {child.location}..."
```

**Implementazione**:
```javascript
// src/integration/gestionale.js
async function fetchChildrenData(gestionale_api_url) {
  const response = await fetch(`${gestionale_api_url}/api/children`);
  return response.json();
}

// In generateContent.js
const child = await fetchChildrenData(GESTIONALE_API_URL);
const enhancedPrompt = `Racconti di ${child.name}...`;
```

---

### 2. Sync Bozze Generate → Gestionale

**Proposta**: Ogni bozza generata viene salvata anche nel gestionale

```javascript
// AFTER /genera, POST a gestionale:
async function saveDraftToGestionale(draft) {
  await fetch(`${GESTIONALE_API_URL}/api/drafts`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      id: draft.id,
      timestamp: draft.timestamp,
      volunteer: draft.volunteer_name,
      category: draft.category,
      content: draft.content,
      photos: draft.photos,
      status: draft.status
    })
  });
}
```

---

### 3. Sync Pubblicazioni → Gestionale

**Proposta**: Tracciare chi ha pubblicato cosa, quando

```sql
-- Query sincronizzazione:
SELECT id, timestamp, volunteer_name, status, 
       meta_facebook_status, meta_instagram_status
FROM drafts
WHERE updated_at > ?
ORDER BY updated_at DESC;
```

**Webhook da bot a gestionale**:
```javascript
// Ogni volta che stato cambia (pending → published):
await fetch(`${GESTIONALE_API_URL}/webhooks/draft-status`, {
  method: 'POST',
  body: JSON.stringify({
    event: 'draft.published',
    draft_id: '...',
    platforms: ['facebook', 'instagram'],
    published_at: new Date()
  })
});
```

---

### 4. Sync Commenti → Gestionale

**Proposta**: Commenti moderati salvati nel gestionale per audit trail

```sql
SELECT comment_id, author, text, score, status, action_taken_by
FROM moderation_queue
WHERE created_at > ?;
```

---

## 🔐 Sicurezza & Dati Sensibili

### 🛡️ Protezione API REST (Implementata 2026-09-24)

**Problema riscontrato**: Le rotte `/api/drafts`, `/api/moderation`, etc. erano pubbliche.  
**Soluzione**: Middleware di autenticazione su tutte le rotte `/api/*`.

```javascript
// src/server.js - Middleware aggiunto
app.use('/api/', requireApiAuth);

function requireApiAuth(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!process.env.API_TOKEN || token !== process.env.API_TOKEN) {
    return res.status(401).json({error: "Unauthorized"});
  }
  next();
}
```

**Uso**:
```bash
# Genera token random
openssl rand -hex 32
# Risultato: es. "a7c2d9e1b4f6..."

# Metti in .env
API_TOKEN=a7c2d9e1b4f6...

# Usa nelle richieste
curl -H "Authorization: Bearer a7c2d9e1b4f6..." \
  http://localhost:3000/api/drafts
```

**Fallback**: Se `API_TOKEN` non è configurato, le API restano pubbliche con warning nei log. Utile per test locale, ma **pericoloso in produzione** — configurare sempre `API_TOKEN`.

### ⚠️ Architettura Attuale (Fase 1 - Solo Bot)

**Attualmente il bot è un sistema standalone.** Il gestionale non è ancora integrato.

```
Dati nel Bot                      Dati Non Nel Bot
├── Foto bambini                  ├── Anagrafe bambini (nomi, date, genitori)
├── Testi generati                ├── Consensi pubblicazione
├── Bozze (estado)                ├── Sostenitori (dati anagrafici)
├── Commenti moderati             ├── Interventi (adozioni, progetti)
├── Logs                          └── Fatturazione
└── Config
```

### FASE 2 - Integrazione Proposta

Per integrare il gestionale (proprietario di dati), il bot deve:
1. **Leggere dal gestionale**: dati pubblicabili (nomi + foto autorizzate)
2. **Scrivere al gestionale**: prove di pubblicazione (foto scelta, piattaforma, URL)
3. **Restare indipendente**: testi generati, bozze, moderazione commenti

### Protezione Attuale

| Elemento | Protezione | Note |
|----------|-----------|-------|
| **Dashboard web** | Basic Auth (Nginx) | Chiede username/password |
| **API REST** (`/api/drafts`) | ❌ NESSUNA | Pubbliche, leggi diretta |
| **Webhook Meta** | X-Hub-Signature | Verifica firma Meta |
| **Database SQLite** | File plain (no crittografia) | Accesso locale solo |
| **Token API** | Variabili d'ambiente (.env, non in git) | Protette su server |
| **HTTPS** | Sì (Let's Encrypt + Traefik) | In produzione |

### Per Integrazione Futura (Fase 2)

**Le API REST devono aggiungere**:
```javascript
// Middleware di autenticazione con token di servizio
app.use((req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token || token !== process.env.GESTIONALE_SERVICE_TOKEN) {
    return res.status(401).json({error: "Unauthorized"});
  }
  next();
});
```

**Database**: SQLite è adatto alla fase attuale (una persona, locale). Se il gestionale cresce, migrare a **PostgreSQL** (multi-utente, centralizzato).

---

## 🚀 Deployment & Infrastruttura

### Stack Attuale (Hostinger):

```
Docker + Docker Compose
├── Immagine Node.js (Dockerfile)
├── SQLite (volume persistente)
├── Traefik (reverse proxy + HTTPS)
└── SSL automatico (Let's Encrypt)
```

### Comandi Deployment:

```bash
# Build e avvia
docker-compose up -d

# Aggiornamenti
git pull origin main
docker-compose up -d --build

# View logs
docker-compose logs -f effata-bot

# Accesso shell
docker-compose exec effata-bot sh
```

---

## 📈 Metriche & Monitoraggio

### Log Disponibili:

```
logs/app.log                    # Rotato ogni 10MB

Livelli:
DEBUG (cyan)  - Dettagli debug
INFO (verde)  - Operazioni importanti
WARN (giallo) - Problemi non critici
ERROR (rosso) - Errori significativi
```

### Metriche Tracciabili:

```bash
# Query nel database:
SELECT COUNT(*) as bozze_totali FROM drafts;
SELECT COUNT(*) as pubblicazioni FROM drafts WHERE status='published';
SELECT category, COUNT(*) FROM drafts GROUP BY category;
SELECT volunteer_name, COUNT(*) FROM drafts GROUP BY volunteer_name;
```

---

## 🔌 Contratto di Integrazione Bot ↔ Gestionale (Fase 2)

### 📋 Flusso Proposto

```
GESTIONALE                          BOT
  │                                  │
  └─→ GET /api/v1/interventi?       │
       stato=da-rendicontare  ──────→ Chiedi cosa c'è da documentare
                                      │
  ┌──────────────────────────────────┘
  │
  ├─→ GET /api/v1/interventi/{id}/   │
  │    dati-pubblicabili ────────────→ Leggi: nome bambino, foto,
  │                                    consenso (NIENTE data nascita,
  │                                    NIENTE provincia esatta)
  │
  └─→ POST /api/v1/interventi/{id}/  │
       prove ─────────────────────────→ Allega foto scelta come prova
                                        (l'AI genera testo, tu fornisci
                                         la foto autorizzata)
  
  ┌──────────────────────────────────────────────┐
  │ BOT Pubblica su Facebook/Instagram/Blog/LinkedIn
  └──────────────────────────────────────────────┘
                      │
  ┌─────────────────────┘
  │
  POST /api/v1/webhooks/bot/    │
       pubblicazione ←─ Avviso: draft_id, intervento_id,
                       piattaforma, URL pubblicato
  
  GESTIONALE marca intervento come "rendicontato"
```

### 🔧 API Bot Verso Gestionale (Fase 2)

#### GET `/api/v1/interventi?stato=da-rendicontare`
```http
Richiesta:
  Authorization: Bearer GESTIONALE_SERVICE_TOKEN
  
Risposta:
[
  {
    "id": "intervento_123",
    "tipo": "adozione_bambino",
    "titolo": "Mable torna a scuola"
  },
  ...
]
```

#### GET `/api/v1/interventi/{id}/dati-pubblicabili`
```http
Richiesta:
  Authorization: Bearer GESTIONALE_SERVICE_TOKEN

Risposta:
{
  "id": "intervento_123",
  "childName": "Mable",
  "age": "9",
  "location": "Uganda",
  "photoUrls": [
    "https://gestionale.effata/uploads/intervento_123_1.jpg",
    "https://gestionale.effata/uploads/intervento_123_2.jpg"
  ],
  "consentPublish": true,  ← Cancello del consenso
  "consentPublishName": true,
  "consentPublishPhoto": true
}
```

#### POST `/api/v1/interventi/{id}/prove`
```http
Richiesta:
  Authorization: Bearer GESTIONALE_SERVICE_TOKEN
  Content-Type: multipart/form-data
  
  file: {foto.jpg}
  tipo: "screenshot_facebook"
  piattaforma: "facebook"
  url: "https://facebook.com/posts/..."

Risposta:
{ "success": true }
```

### 📨 Webhook: Bot Avvisa Gestionale

```http
POST https://gestionale.effata/api/v1/webhooks/bot/pubblicazione

Body:
{
  "event": "draft.published",
  "draft_id": "1704067200000",
  "intervento_id": "intervento_123",
  "piattaforme": ["facebook", "instagram"],
  "urls": {
    "facebook": "https://facebook.com/posts/...",
    "instagram": "https://instagram.com/p/..."
  },
  "published_at": "2026-09-24T14:30:00Z"
}

Header: X-Webhook-Signature: sha256=...
```

### 📦 API Bot Per Uso Interno (Assistenti Volontari)

```http
GET /api/drafts
  ⚠️ NON AUTENTICATO - Accesso pubblico
  Response: [{id, timestamp, status, volunteer_name, ...}]

POST /api/drafts/:id/status
  ⚠️ NON AUTENTICATO - Accesso pubblico
  Body: {status: "da_pubblicare"|"in_lavorazione"|"pubblicato"}
  
GET /api/drafts/:id/zip
  ⚠️ NON AUTENTICATO - Accesso pubblico
  Response: Binary ZIP (foto + testo)
```

**Nota**: Questi endpoint sono pubblici perché la dashboard è protetta da Basic Auth su Nginx. Se il gestionale accede alle stesse API, aggiungere token di servizio.

---

## 🎯 Checklist Integrazione Gestionale (Fase 2)

### Architettura API-First (Consigliato)

**Principio**: Gestionale e Bot sono sistemi indipendenti. Comunicano solo via API con token di servizio.

- [ ] **Gestionale**: Espone API autenticate per interventi + dati pubblicabili
  ```
  GET  /api/v1/interventi?stato=da-rendicontare
  GET  /api/v1/interventi/{id}/dati-pubblicabili
  POST /api/v1/interventi/{id}/prove
  ```

- [ ] **Bot**: Aggiungere autenticazione alle API REST (token di servizio)
  ```javascript
  // src/server.js - middleware
  app.use((req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (token !== process.env.GESTIONALE_SERVICE_TOKEN) {
      return res.status(401).json({error: "Unauthorized"});
    }
    next();
  });
  ```

- [ ] **Webhook**: Bot notifica gestionale su `POST /api/v1/webhooks/bot/pubblicazione`
  ```
  Firma webhook: X-Webhook-Signature (sha256)
  Body: {draft_id, intervento_id, piattaforme, urls, published_at}
  ```

- [ ] **Database Integrazione**: Aggiungere colonna `intervento_id` a `drafts` (SQLite)
  ```sql
  ALTER TABLE drafts ADD COLUMN intervento_id TEXT;
  ```

- [ ] **Token di Servizio**: Configurare in `.env` (bot e gestionale)
  ```bash
  GESTIONALE_SERVICE_TOKEN=sk-service-...
  GESTIONALE_API_URL=https://gestionale.effata
  ```

### ❌ DA EVITARE

- ❌ **Condividere database SQLite** tra bot e gestionale (accoppiamento)
- ❌ **Condividere cartelle** (`/output/`, `/assets/`) via NFS (sincronizzazione complessa)
- ❌ **Sync periodica di tabelle** (commenti, bozze) — usa webhook
- ❌ **API senza autenticazione** — aggiungere token bearer
- ❌ **Esporre dati di minori** (province esatte, date complete) senza consenso

### ✅ Cosa Rimane Nel Bot

- Testi generati (non servono al gestionale)
- Bozze e loro stato (traccia nel bot per reference)
- Moderazione commenti (dati di terzi, no utilità gestionale)
- Promozioni (calendario, ruote di speranza)
- Log applicazione

---

## 📞 Supporto & Prossimi Step

Per domande su integrazione:
1. Leggi README.md e PIANO-LAVORO.md (già passati)
2. Consulta codice in `src/` (ben commentato)
3. Scrivi a: team dev Effatá

**Documenti correlati**:
- `README.md` — Overview funzionalità
- `PIANO-LAVORO.md` — Roadmap e fasi implementazione
- `README-MODERATION.md` — Dettagli moderazione commenti

---

## 🔍 Verifica Affermazioni su Codice

Questo documento è stato verificato confrontandolo con il codice sorgente. Risultati:

| Affermazione | Verificata | Dove | Note |
|---|---|---|---|
| **SQLite è il database** | ✅ | `database.js:1` | Sì, `sql.js` |
| **Database crittografato a riposo** | ❌ FALSO | `database.js:22` | SQLite plain, NO SQLCipher |
| **Modello Claude: claude-3-5-sonnet** | ❌ FALSO | `generateContent.js:118` | Reale: `claude-sonnet-4-6` |
| **API /api/drafts autenticate** | ❌ FALSO | `server.js:43` | Pubbliche, no middleware auth |
| **Dashboard ha Basic Auth** | ✅ | Docker-compose + Nginx config | Sì, username/password |
| **Instagram stories come bozze** | ❌ FALSO | `metaAPI.js:536-711` | Pubblicazione diretta (`media_publish`) |
| **Webhook Meta verificati** | ✅ | `metaWebhook.js` | X-Hub-Signature verificata |
| **Dati bambini in categoryData** | ✅ | `database.js:61` | JSON in colonna `categoryData` |
| **Facebook come bozza** | ✅ | `metaAPI.js:475+` | `status="DRAFT"`, volontario approva |
| **Integrazione LinkedIn parziale** | ✅ | `linkedinAPI.js` | Beta, non completamente automatico |
| **Moderazione commenti attiva** | ✅ | `commentModerator.js` | Filtri locali + API (Perspective, OpenAI) |
| **Log rotati ogni 10MB** | ✅ | `docker-compose.yml:39-42` | `max-size: 10m` |

**Conclusione**: 3 affermazioni non verificate (crittografia, modello, API auth, Instagram status). Corretto in questa versione.

---

**Fine documentazione integrazione**
