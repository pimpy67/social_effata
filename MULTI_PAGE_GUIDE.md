# 🌍 Guida: Pubblicazione Multi-Pagina (Italia + Uganda)

Questo sistema pubblica automaticamente lo stesso contenuto su 2 pagine Facebook separate con testi diversi:
- **Pagina Italia**: testo in italiano
- **Pagina Uganda**: testo tradotto in inglese

---

## 📋 Setup Iniziale

### 1. **Configura le credenziali in `.env`**

Aggiungi le variabili per la pagina Uganda (Italia è già configurata):

```env
# Pagina Italia
META_PAGE_ID_IT=1078382168688068
META_PAGE_ACCESS_TOKEN_IT=EAAUFq1nGuUs...

# Pagina Uganda
META_PAGE_ID_UG=100090196903244
META_PAGE_ACCESS_TOKEN_UG=EAAXX...  # Genera da Facebook Developers
```

**Come ottenere il token Uganda:**
1. Vai a https://developers.facebook.com/tools/explorer
2. Seleziona la tua App
3. Ottieni un token di accesso con permessi `pages_manage_posts`, `pages_manage_engagement`, `instagram_manage_posts`
4. Usa il token per la pagina Uganda

---

## 🔧 Integrazione nel Telegram Bot

### Opzione 1: Sostituzione semplice (Consigliato)

Nel file `telegramBot.js` linea ~942, sostituisci:

```javascript
// PRIMA
const metaResults = await metaAPI.publishToMetaBusiness(
  result.facebookPost,
  result.instagramStory,
  images,
  optimizedPhotos
);
```

Con:

```javascript
// DOPO
import { publishToItalyAndUganda } from "./publishToMultiPage.js";

// ... codice ...

const metaResults = await publishToItalyAndUganda(
  result,  // Tutto il contenuto (italiano)
  images,
  { 
    publishStories: true,
    optimizedPhotos 
  }
);
```

**Cosa cambia nel response:**
- `metaResults.pages[0]` = Risultati Italia
- `metaResults.pages[1]` = Risultati Uganda (se configurata)

---

## 📝 File Nuovi Aggiunti

### 1. **translateContent.js**
Traduce il testo da italiano a inglese usando Claude API.

- `translateToEnglish(text)` - traduce un singolo testo
- `translateStoryContent(italianContent)` - traduce tutto il contenuto generato

### 2. **multiPagePublisher.js**
Publisher generico per gestire N pagine con contenuti diversi.

### 3. **publishToMultiPage.js**
Helper semplificato specifico per Italia + Uganda. **Questo è quello da usare nel telegramBot.**

---

## 🚀 Comportamento

### Quando pubblichi un contenuto:
1. ✅ Generi il contenuto in italiano (come adesso)
2. ✅ Sistema traduce automaticamente in inglese
3. ✅ Pubblica su **Pagina Italia** con testo italiano
4. ✅ Pubblica su **Pagina Uganda** con testo inglese
5. ✅ Storie, Reel, Instagram, LinkedIn → tutte le piattaforme su entrambe

### Gestione errori:
- Se Uganda non è configurata → pubblica solo su Italia
- Se un'operazione fallisce → continua con l'altra pagina
- Tutti gli errori vengono loggati e riportati

---

## 💡 Variabili d'Ambiente

```env
# Obbligatorie
META_PAGE_ID_IT=...          # ID pagina Italia
META_PAGE_ACCESS_TOKEN_IT=...  # Token Italia

# Opzionali (se non configurate, disabilita Uganda)
META_PAGE_ID_UG=...          # ID pagina Uganda
META_PAGE_ACCESS_TOKEN_UG=...  # Token Uganda

# Già utilizzate
ANTHROPIC_API_KEY=...        # Per traduzione Claude
```

---

## 🧪 Test

Per testare la traduzione senza pubblicare:

```javascript
import { translateStoryContent } from "./src/translateContent.js";

const italianContent = {
  facebookPost: "Questo è il testo italiano",
  instagramStory: "Testo Instagram",
  // ... altri campi
};

const englishContent = await translateStoryContent(italianContent);
console.log(englishContent.facebookPost); // Testo tradotto
```

---

## 📊 Log Output

Quando pubblichi, vedrai:

```
🌍 Inizio pubblicazione multi-pagina (Italia + Uganda)...

📘 Pagina Italia - Pubblicazione...
  ✓ Facebook (post): 1234567890
  ✓ Instagram (post): 9876543210
  ✓ Facebook Story: 2 pubblicata(e)
  ✓ Instagram Story: 2 pubblicata(e)

📱 Pagina Uganda - Traduzione e pubblicazione...
  Traduzione in inglese...
  ✓ Traduzione completata
  ✓ Facebook (post): 1111111111
  ✓ Instagram (post): 2222222222
  ✓ Facebook Story: 2 pubblicata(e)
  ✓ Instagram Story: 2 pubblicata(e)

📊 Riepilogo: 2 pagina(e) processata(e)
✅ Nessun errore
```

---

## ⚙️ Configurazione Avanzata

Se vuoi più controllo, usa direttamente `MultiPagePublisher`:

```javascript
import { MultiPagePublisher } from "./multiPagePublisher.js";

const metaAPIIt = new MetaAPI(tokenIt, idIt);
const metaAPIUg = new MetaAPI(tokenUg, idUg);

const pages = [
  { name: "Italia", metaAPI: metaAPIIt, text: italianText, storyText: italianStories },
  { name: "Uganda", metaAPI: metaAPIUg, text: englishText, storyText: englishStories },
];

const publisher = new MultiPagePublisher(pages);
const results = await publisher.publishToAllPages(images);
```

---

## 🔐 Note sulla Sicurezza

⚠️ **NON committare i token nel `.env` su git!**

- Aggiungi `.env` al `.gitignore`
- Usa variabili d'ambiente in produzione
- Ruota i token periodicamente su Meta Developers

