# 🛡️ Sistema di Moderazione Commenti

Sistema ibrido di moderazione per bloccare automaticamente commenti razzisti, sessisti e discriminatori.

## Architettura

```
Commento ricevuto da Meta
        ↓
1️⃣ Normalizzazione testo (rimuovi spazi, accenti, leetspeak)
        ↓
2️⃣ Check lista open-source italiana (italian-badwords-list)
        ↓
3️⃣ Check regex hardcoded (razzismo, sessismo, incitamento)
        ↓
4️⃣ Check config JSON personalizzato (custom keywords)
        ↓
5️⃣ Check API Perspective (Google) [opzionale]
   Check API OpenAI Moderation [opzionale]
        ↓
SCORE TOTALE → BLOCK (≥100) | FLAG (≥50) | OK (<50)
        ↓
Se BLOCK → Nascondi su Meta
Se FLAG → Coda di review + Email alert
```

---

## 1. Filtro Locale (No API, Gratis)

**Attivo per default.** Combina:

### Lista Open-Source Italiana
- **Pacchetto npm:** `italian-badwords-list`
- **Copre:** Parole volgari, insulti, slur razziali in italiano
- **Non serve API key**

### Parole Chiave Personalizzate
Modifica `config/moderation-keywords.json`:

```json
"custom_additions": {
  "items": [
    "poo vengono in italia a rubare",
    "donne violentate",
    "frasi razziste ricorrenti"
  ]
}
```

### Normalizzazione Anti-Evasione
Il filtro normalizza il testo prima di controllare:
- `"S.T.U.P.R.A.R.E"` → `"stuprare"` ✓ Bloccato
- `"n3gr0"` → `"negro"` ✓ Bloccato
- `"m0 r0"` → `"moro"` ✓ Bloccato
- Rimuove accenti: `"é"` → `"e"`

---

## 2. Perspective API (Google) [Consigliato]

**Gratuito**, rileva contenuto offensivo in **italiano** con AI.

### Attivazione

1. **Crea un progetto Google Cloud:**
   ```
   https://console.cloud.google.com
   ```

2. **Abilita Perspective API:**
   - Vai a APIs & Services → Library
   - Cerca "Perspective API" → Enable

3. **Crea una API Key:**
   - Credenziali → Crea chiave API
   - Copia la chiave

4. **Aggiungi al .env:**
   ```bash
   PERSPECTIVE_API_KEY=your-key-here
   ```

### Metriche Rilevate
- `TOXICITY` - Tossicità generale (0-1)
- `SEVERE_TOXICITY` - Tossicità severa
- `IDENTITY_ATTACK` - Attacchi a identità (razzismo, sessismo)
- `THREAT` - Minacce esplicite

### Uso
Viene chiamata automaticamente se `PERSPECTIVE_API_KEY` è configurato.

---

## 3. OpenAI Moderation API [Alternativa]

**Gratuito per account OpenAI**, approccio basato su LLM.

### Attivazione

1. **Crea account OpenAI:**
   ```
   https://platform.openai.com
   ```

2. **Genera API Key:**
   - API Keys → Create new secret key
   - Copia la chiave

3. **Aggiungi al .env:**
   ```bash
   OPENAI_API_KEY=sk-...
   ```

### Categorie Rilevate
- `hate` - Contenuto d'odio
- `hate/threatening` - Odio + minacce
- `self-harm` - Auto-danneggiamento
- `sexual` - Contenuto sessuale
- `sexual/minors` - Abuso minori
- `violence` - Violenza
- `violence/graphic` - Violenza grafica

---

## 4. Coda di Revisione

### Commenti FLAG
Vanno in coda di moderazione per review umana.

**Visualizza:**
```bash
curl http://localhost:3000/api/moderation/dashboard
```

**Approva:**
```bash
curl -X POST http://localhost:3000/api/moderation/approve/COMMENT_ID
```

**Rifiuta:**
```bash
curl -X POST http://localhost:3000/api/moderation/reject/COMMENT_ID
```

---

## Configurazione Consigliata

### Massima Protezione (Con API):
```bash
# .env
PERSPECTIVE_API_KEY=your-key
OPENAI_API_KEY=your-key
```

Con entrambe le API:
- Filtro locale (veloce, zero costi)
- Perspective API (rilevazione d'odio)
- OpenAI Moderation (rilevazione contestuale)

### Budget-Friendly (Solo Locale):
```bash
# Niente API key
# Solo filtro locale + regex hardcoded
```

Funziona bene per la maggior parte dei commenti comuni.

---

## Score System

```
Score Totale                   → Azione
─────────────────────────────────────────
≥ 100 (BLOCK)                  → Nascondi subito su Meta
50-99 (FLAG)                   → Coda review + Email alert
20-49 (WATCH)                  → Log (informativo)
< 20 (OK)                      → Processa normalmente
```

### Come aumenta il score:
- Lista italiana: +80 punti
- Regex hardcoded: +100 per match
- Regex config: +100 per match
- Perspective (identity_attack > 0.7): +30 punti
- OpenAI (flagged=true): +50 punti

---

## Esempi di Uso

### Aggiungere una frase razzista alla blacklist:

Modifica `config/moderation-keywords.json`:
```json
"custom_additions": {
  "items": [
    "poo vengono in italia a stuprare e rubare",
    "sporchi migranti invaditori"
  ]
}
```

✓ Verranno bloccati automaticamente dal prossimo commento.

### Consultare la coda di moderazione:

```bash
curl http://localhost:3000/api/moderation/queue
```

Risposta:
```json
{
  "pending": [
    {
      "id": "comment_123",
      "author": "NomedellAutore",
      "platform": "facebook",
      "text": "Commento sospetto...",
      "score": 75,
      "reason": "Possibile contenuto offensivo"
    }
  ],
  "approved": [...],
  "rejected": [...]
}
```

---

## Troubleshooting

### Perspective API non funziona
- Verifica che `PERSPECTIVE_API_KEY` sia nel `.env`
- Controlla che Perspective API sia abilitato in Google Cloud Console
- Controlla i log: `docker compose logs bot`

### OpenAI API non funziona
- Verifica che `OPENAI_API_KEY` sia nel `.env`
- Account OpenAI deve avere crediti o piano pagato

### Commenti passano comunque
- Aggiungi la frase a `config/moderation-keywords.json`
- Aumenta i threshold nei livelli (BLOCK/FLAG/WATCH)
- Consulta i log per debug

---

## Best Practices

✓ **Fai:** Mantieni `config/moderation-keywords.json` aggiornato  
✓ **Fai:** Rivedi periodicamente la coda di moderazione  
✓ **Fai:** Usa Perspective API per massima accuratezza  

✗ **Non fare:** Non mettere dati personali nelle keyword  
✗ **Non fare:** Non bloccare interi dialetti (es. tutte le parole meridionali)  
✗ **Non fare:** Non usare solo regex - usa normalizzazione + liste

---

## Risorse

- [italian-badwords-list npm](https://www.npmjs.com/package/italian-badwords-list)
- [Perspective API Docs](https://perspectiveapi.com/)
- [OpenAI Moderation API](https://platform.openai.com/docs/guides/moderation)
