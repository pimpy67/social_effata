# Configurazione Trascrizione Vocale (Whisper)

Il bot supporta ora i **messaggi vocali**: Silvia (e gli altri volontari) possono mandare vocali che verranno automaticamente trascritti a testo e aggiunti alle storie.

## Setup

### 1. Ottieni una chiave API OpenAI

1. Vai su [platform.openai.com](https://platform.openai.com)
2. Accedi o registrati
3. Vai su **API keys** (menu sinistro)
4. Clicca **Create new secret key**
5. Copia la chiave (forma: `sk-proj-...`)

### 2. Configura il .env

Aggiungi nel file `.env`:

```bash
OPENAI_API_KEY=sk-proj-tuachiaveaqui
```

### 3. Riavvia il bot

```bash
npm start
```

## Come funziona

**Flusso**:
1. Silvia manda un messaggio vocale nel gruppo Telegram
2. Il bot scarica il file vocale (formato `.ogg`)
3. Lo invia a OpenAI Whisper per la trascrizione
4. La trascrizione (testo) viene aggiunta automaticamente al materiale della storia
5. Il bot conferma con un messaggio: `✅ Vocale trascritto e aggiunto al materiale`

**Caratteristiche**:
- ✅ Trascrizione in **italiano** (predefinita)
- ✅ Funziona anche durante le domande di categoria (risponde il vocale alla domanda)
- ✅ Se il vocale è vuoto/non comprensibile, il bot lo segnala
- ✅ La trascrizione conta nelle validazioni di lunghezza testo

## Costi

Whisper di OpenAI costa **$0.02 per minuto di audio** (tariffazione al momento, controllare [pricing](https://openai.com/pricing/)).

Esempio:
- Vocale di 1 minuto = $0.02
- Vocale di 5 minuti = $0.10
- Vocale di 30 minuti = $0.60

## Se OPENAI_API_KEY non è configurato

Se la chiave manca:
- Il bot continua a funzionare normalmente con foto, testi e video
- Se qualcuno manda un vocale, riceve il messaggio: `⚠️ Trascrizione vocale non configurata (manca OPENAI_API_KEY nel .env). Manda testo scritto invece di messaggi vocali.`

## Troubleshooting

### "Messaggio vocale vuoto o non comprensibile"
- Il vocale potrebbe avere audio troppo basso o rumore eccessivo
- Prova a mandare un vocale più chiaro

### Errore di API key non valida
- Verifica di aver copiato bene la chiave da platform.openai.com
- Assicurati che la chiave sia attiva (non revocata)
- Controlla che nel .env sia `OPENAI_API_KEY=...` senza spazi

### Trascrizione non in italiano
- Nel file `src/voiceTranscriber.js`, la riga `language: "it"` forza l'italiano
- Se vuoi cambiare lingua, modificala in quel file (es. `language: "en"` per inglese)
