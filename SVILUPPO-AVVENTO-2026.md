# Sviluppo — Calendario dell'Avvento Effatà 2026

*Documento tecnico per chi sviluppa. Bozza del 21/10/2026. Il piano editoriale giorno per giorno è in `piano-avvento-2026-v3.csv`.*

## 0. Obiettivo e date

Vendere la **gift card di Natale da 20 €** (un disegno dei bambini della Casa Famiglia Effatà in Uganda) con:
- un contenuto social al giorno dal 1 al 25 dicembre, più il lancio del 29/11;
- un'email al giorno agli iscritti alla lista "Avvento";
- link che portano **direttamente al disegno scelto** e al pagamento;
- tracciamento del canale di provenienza di ogni vendita.

| Scadenza | Cosa deve essere pronto |
|---|---|
| **08/11** | Prerequisiti (sezione 2) risolti |
| **10/11** | Prova di sponsorizzazione da pochi euro andata a buon fine |
| **15/11** | Modifiche al sito in produzione · articolo del blog online · modulo Brevo attivo |
| **16/11** | Email di invito ai 628 contatti · inserzione per le iscrizioni |
| **20/11** | Tutti i contenuti dei 26 giorni generati e approvati |
| **20–27/11** | Modulo Avvento del bot in prova (data simulata) · programmazione caricata |
| **29/11** | Lancio |
| **01–25/12** | Pubblicazione automatica |

**Regola ferma:** l'Avvento (gift card 20 €, `natale-avvento.html`) **non** va mescolato con il calendario delle adozioni (giorno a 50 €, home del sito).

---

## 1. Stato attuale (verificato il 21/10)

### Repository

| Repository | Ruolo | Note |
|---|---|---|
| `pimpy67/calendario-solidale-uganda` | Sito `calendario.effataitalia.it` (Express + statico) | Ultimo push 20/10 (fix finestre 11 e 18). **La copia sul Mac è indietro**: fare `git stash` + `git pull` prima di toccarla. |
| `pimpy67/social_effata` | Bot Telegram + pubblicazione Meta + dashboard | Ultimo push 08/10. **Il codice della prova Avvento del 21/10 non è su GitHub** (script `bozza-video-v2.mjs`, `crea-video-porta2*.sh` sul Desktop): va versionato. |

### Calendario dell'Avvento (sito)
- Dati: `public/data/avvento.json` → 25 `doors`. **Porte dispari = disegno** (`disegno`, `miniatura`, a volte `disegno_retro`), **porte pari = verso** (`text`) + audio `public/audio/porta-NN.mp3`. Eccezioni: 15 e 16 sono entrambe disegni, 17 è un verso con riga aggiuntiva (`filastrocca`), 18 e 19 disegni, 25 albero + presepe.
- **La filastrocca è completa**: non mancano versi. Ogni disegno illustra il verso del giorno dopo.
- JS: `public/js/natale-avvento.js` → `selectDay(day, face)` seleziona un disegno e centra il carosello; data simulabile con `?oggi=2026-12-10`.
- Checkout: `POST /api/natale/checkout` (`server/routes/api.js` ~riga 621) → Stripe Checkout, `metadata: { type, natale_id, payment_id }`.
- Vendita: doppio interruttore **non allineato**: env `NATALE_VENDITA_ATTIVA=false` (server spento) ma `avvento.json` → `vendita_attiva: true` (modulo visibile).
- Gift card: si apre il 24/12 alle 00:00, email il 25/12 alle 00:00 (commit `2f45d56`).
- Nessuno strumento di statistica sul sito del calendario.

### Bot social
- Pubblica già su Facebook e Instagram: `metaAPI.js` → `publishToFacebook`, `publishFacebookDraft`, `getFacebookPostPermalink`, `publishFacebookStory`, `publishToInstagram` (anche carosello), `publishInstagramReel(caption, videoUrl)`, `publishInstagramStory`, `publishInstagramStoryVideos`.
- Promo automatiche in `telegramBot.js` con `setInterval` orario: `runCalendarPromoIfDue` (adozioni, **mar e ven alle 18**) e `runGofundmePromoIfDue`.
- `utm.js` → `TRACKED_HOSTS` contiene solo `effataitalia.it` e `www.effataitalia.it`.
- `keywordReply.js` → risposte **pubbliche** alle parole chiave; `shareKeyword.js` → primo commento "CONDIVISO".
- `emailAPI.js` → nodemailer (SMTP).
- Facebook ora trasforma i video caricati in Reel.

### Meta
- Portfolio "Effata Charity Organisation Uganda", utente di sistema `bot-effata` (ID 61595352164944).
- Pagina **Effatà Italia ODV**: accesso completo ✅
- Account Instagram `effata_charity_organisation`: **"Ancora nessuna assegnazione"** ❌ → il token attuale non pubblica su Instagram.
- Prove del 21/10: post con immagine **pubblicato per errore** (`1078382168688068_122131998074880906`); video in bozza (`1486115903435819`, quadrato 1080x1080, 6,3 s, nessun testo a schermo).

---

## 2. Prerequisiti (non di sviluppo, ma bloccanti)

- [ ] **P1** Assegnare l'account Instagram a `bot-effata` (Impostazioni → Utenti di sistema → Assegna risorse → controllo completo).
- [ ] **P2** Generare il token definitivo **dopo** P1, con `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`, `instagram_basic`, `instagram_content_publish` (+ `instagram_manage_messages` se si fa B6).
- [ ] **P3** Aggiornare `.env` sul VPS e sul Mac → riavviare il bot (oggi è **fermo**) → **revocare** tutti i token comparsi in chat.
- [ ] **P4** Eliminare il post di prova pubblicato.
- [ ] **P5** `vendita_attiva: false` in `avvento.json` finché la vendita non è pronta (vedi C4).
- [ ] **P6** Consenso di Silvia all'uso delle foto della cartella `IMMAGINI/INIZI DI SILVIA` (si vedono volti di bambini).
- [ ] **P7** Allineare i repository locali con GitHub e versionare gli script della prova del 21/10.
- [ ] **P8** Account pubblicitario: metodo di pagamento, collegamento a Pagina e Instagram, prova da 3–5 € (verificare che non scatti la richiesta "temi sociali").
- [ ] **P9** Chiarire quale Pagina Facebook usare: `facebook.com/effataitalia` oppure `profile.php?id=61576427205615` (link usato in `emailAPI.js`).

Nessun segreto (token, chiavi Stripe/Brevo) va in chat o nei commit: solo `.env`.

---

## 3. Sito del calendario — `calendario-solidale-uganda`

### C1 — Indirizzo corto `/natale`
- In `server/server.js`, prima di `express.static`: `app.get(['/natale', '/avvento'], (req, res) => res.redirect(301, '/natale-avvento.html' + querystring))`, **mantenendo la query string**.
- **Accettazione:** `calendario.effataitalia.it/natale?disegno=5&da=fb` → `natale-avvento.html?disegno=5&da=fb`.

### C2 — Link diretto al disegno `?disegno=N`
- In `natale-avvento.js`, dopo il caricamento delle porte: leggere `disegno` (es. `5`, oppure `15r` / `21r` per il retro) → `selectDay(day, face)` → scorrere la pagina fino al modulo (rispettando `prefers-reduced-motion`).
- Valori non validi (porta senza disegno, numero fuori 1–25) → ignorare in silenzio.
- **Accettazione:** su telefono e desktop, `?disegno=7` apre la pagina con "Finestra 7" selezionata nel modulo e il carosello centrato sul 7.

### C3 — Canale di provenienza fino a Stripe `?da=…`
- Valori ammessi (lista chiusa, minuscolo): `fb`, `fb-storia`, `ig`, `ig-storia`, `ig-bio`, `email`, `whatsapp`, `blog`, `ads`, `altro`. Qualsiasi altro valore → `altro`.
- Il client salva `da` in `sessionStorage` (con try/catch) e lo aggiunge al corpo di `POST /api/natale/checkout`.
- Il server valida il valore, lo salva sulla gift card (nuova colonna `canale` nella tabella delle gift card di Natale, migrazione idempotente) e lo aggiunge a `metadata.canale` nella sessione Stripe.
- Admin: aggiungere `canale` all'export e un conteggio per canale (vendite pagate).
- Nessun cookie e nessun servizio esterno: niente da aggiungere all'informativa oltre al dato "canale di provenienza".
- **Accettazione:** un acquisto di prova da `?da=ig-storia` mostra `canale=ig-storia` in Stripe e nell'export admin.

### C4 — Un solo interruttore per la vendita
- La pagina oggi legge `vendita_attiva` dal JSON, il server legge `NATALE_VENDITA_ATTIVA`. Proposta: nuovo `GET /api/natale/stato` → `{ vendita_attiva: bool }` letto dall'env; la pagina mostra o nasconde il modulo in base a quello (con fallback: modulo nascosto se la chiamata fallisce).
- **Accettazione:** cambiando solo l'env e riavviando, modulo e checkout si accendono o si spengono insieme.

### C5 — Riquadro "Ricevi la finestra ogni mattina"
- Piccolo blocco sulla pagina dell'Avvento con link all'articolo del blog (o il modulo Brevo incorporato, se Complianz non lo blocca).
- Anche nella pagina di conferma dopo il pagamento (`?ok=1`).

### C6 — Controlli finali
- `?oggi=` per verificare porte, audio e carosello per tutti i giorni dal 01/12 al 26/12.
- Anteprima WhatsApp e Facebook del link `/natale` (titolo, descrizione, immagine).

---

## 4. Contenuti — generazione dei video e delle immagini

Script pronti (Python 3 + Pillow + ffmpeg, font **Patrick Hand** OFL + Inter):

| Script | Uso | Output |
|---|---|---|
| `make_reel.py` | `immagine audio "verso" giorno out.mp4 [disegno_finale] ["didascalia"]` | Reel 9:16 1080x1920, 30 fps: immagine con zoom lento + verso scritto + voce, poi 3 s di cartolina "Regala questo disegno · 20 €" |
| `make_reel_carosello.py` | `audio "verso" giorno out.mp4` | Reel 9:16: verso a tutto schermo + voce, carrellata dei 13 disegni (0,9 s ciascuno), griglia finale con invito |

Prototipi approvati come direzione: `reel-porta-02.mp4`, `reel-porta-06.mp4` (A), `reel-porta-06-carosello.mp4` (B).

### Da fare
- [ ] **G1** Spostare gli script in `social_effata/scripts/avvento/` con font e percorsi relativi (oggi puntano a cartelle temporanee).
- [ ] **G2** Leggere i dati da `avvento.json` (verso, disegni, audio) invece che da argomenti, per generare tutto con un comando: `node|python genera-avvento.py --tutto`.
- [ ] **G3** Formato dei **giorni con disegno**: post con immagine 4:5 (1080x1350) con il disegno + storia 9:16, e opzionale video breve con zoom senza voce. Testo = verso del giorno dopo.
- [ ] **G4** Giorni con verso: versione A o B secondo la colonna "Formato Reel" del piano (A di base; B l'8, 12, 22, 24, si decide di volta in volta).
- [ ] **G5** Storie 9:16 per ogni giorno (immagine statica con verso + spazio libero in basso per lo sticker Link di Instagram).
- [ ] **G6** Lancio 29/11 (carrellata senza verso) e chiusura 25/12 (albero + presepe + grazie).
- [ ] **G7** Nella cartolina finale: `calendario.effataitalia.it/natale · link in bio` quando C1 è online.
- [ ] **G8** Zone sicure dei Reel: testi importanti tra y≈250 e y≈1500 (in basso Instagram copre con didascalia e pulsanti).
- [ ] **G9** Controllo: durata, volume (normalizzare a −16 LUFS), che l'audio `porta-17` contenga anche la riga "Un giaciglio comodo…".
- [ ] **G10** Facoltativo: sottofondo musicale senza diritti (licenza da conservare).

Struttura di uscita proposta:
```
social_effata/avvento/
  piano.json                # indice dei 26 giorni (vedi B3)
  2026-11-29/ reel.mp4  storia.jpg  facebook.txt  instagram.txt
  2026-12-01/ post.jpg  storia.jpg  facebook.txt  instagram.txt  email.html
  ...
```

---

## 5. Bot social — `social_effata`

### B1 — Tracciamento dei link
- Aggiungere `calendario.effataitalia.it` a `TRACKED_HOSTS` in `utm.js`, **oppure** (consigliato) usare per il calendario il parametro `da=` di C3, che arriva fino a Stripe.

### B2 — Pausa delle altre promo
- `calendarPromo` (adozioni) e `gofundmePromo`: nessuna uscita tra il **24/11 e il 26/12** (data Europe/Rome). Finestra configurabile da `.env` (`PROMO_PAUSA_DAL`, `PROMO_PAUSA_AL`). Test unitario come `__tests__/calendarPromo.test.js`.

### B3 — Modulo `avventoPromo.js`
Sul modello di `calendarPromo.js`.

**Dati:** `avvento/piano.json`
```json
{
  "orario": "07:30",
  "giorni": {
    "2026-12-06": {
      "tipo": "reel",
      "media": "2026-12-06/reel.mp4",
      "storia": "2026-12-06/storia.jpg",
      "facebook": "2026-12-06/facebook.txt",
      "instagram": "2026-12-06/instagram.txt",
      "disegno": 5,
      "link": "https://calendario.effataitalia.it/natale?disegno=5"
    }
  }
}
```
Il bot aggiunge `&da=fb` / `&da=ig` / `&da=fb-storia` ai link in automatico.

**Comportamento, ogni giorno alle 07:30 Europe/Rome:**
1. Facebook: video → Reel della Pagina, oppure foto; testo con link cliccabile; primo commento con il link.
2. Instagram: Reel (`publishInstagramReel`, serve un **URL pubblico** del video: caricarlo sul server del calendario o su WordPress) oppure post; testo con "link in bio".
3. Storie: Facebook (`publishFacebookStory`) e Instagram (`publishInstagramStory`). **Lo sticker Link non si può aggiungere via API:** il bot manda su Telegram l'immagine della storia + il link con `da=ig-storia`, e un volontario la ripubblica con lo sticker dal telefono.
4. Recupera il permalink Facebook e lo passa all'email del giorno (B4).
5. Riepilogo su Telegram ad `ALLOWED_CHAT_ID` con esito canale per canale e link.

**Robustezza:**
- Stato in `avvento-promo-state.json` (ultimo giorno pubblicato, per canale): un riavvio non ripubblica, un canale fallito si può ritentare da solo.
- Comandi Telegram: `/avvento` (pubblica ora il giorno corrente), `/avvento 2026-12-06` (giorno specifico), `/avvento-stato`.
- Ritenta ogni ora fino alle 12:00, poi avvisa e si ferma.
- `AVVENTO_DRY_RUN=true` → genera tutto e manda a Telegram senza pubblicare; `AVVENTO_OGGI=2026-12-06` → simula la data.
- Test unitari: scelta del giorno, pausa, idempotenza, link con `da=`.

### B4 — Email del giorno
- **Opzione consigliata:** Brevo, una campagna al giorno sulla lista "Avvento", **programmata in anticipo** (Brevo lo permette). Link al post: pagina Facebook, oppure permalink del post Facebook programmato (B5), che esiste già prima della pubblicazione.
- **Alternativa:** il bot invia l'email dopo aver pubblicato, via API Brevo (campagna o transazionale in batch) con il permalink esatto.
- Contenuto: la porta del giorno (immagine o foto + verso + tasto "Ascolta") → "Guarda il post di oggi" → "Come regalare un disegno" in 3 passi → griglia dei disegni (miniature con link `?disegno=N&da=email`) → pulsante "Regala un disegno · 20 €" → disiscrizione.
- **Il carosello non funziona nei client email:** usare una griglia di miniature (HTML a tabelle, larghezza 600, immagini ospitate sul sito).
- Email di benvenuto (automazione Brevo) per chi si iscrive a dicembre, con le finestre già aperte.

### B5 — Programmazione su Facebook (in alternativa a B3 per Facebook)
- Script che carica i post Facebook come **programmati** (`published=false` + `scheduled_publish_time`), così compaiono in Business Suite → Contenuti → Programmati e chiunque li può controllare.
- Verificare il limite massimo di anticipo consentito dalla Graph API per foto e video prima di caricare tutto il mese (eventualmente caricare in due blocchi).
- Instagram non permette la programmazione via API: o lo pubblica il bot (B3) o si programma a mano in Business Suite.
- **Decisione D1 aperta** (vedi sezione 8).

### B6 — Parola chiave "REGALO" (facoltativo)
- Chi commenta "REGALO" riceve il link.
- Facebook: risposta pubblica (il link è cliccabile).
- Instagram: **risposta privata** al commento (private reply, permesso `instagram_manage_messages`), perché nei commenti di Instagram il link non è cliccabile.
- Riusare `keywordReply.js` + `config/keyword-replies.json` (con `enabled` per l'approvazione del testo).

---

## 6. Iscrizioni ed email — Brevo

- [ ] **E1** Lista "Avvento 2026" separata dalla newsletter.
- [ ] **E2** Modulo Brevo con **doppia conferma** e casella di consenso; testo dell'informativa coerente con quella del calendario.
- [ ] **E3** Mittente `info@effataitalia.it` (DKIM e DMARC già configurati): fare un test di consegna su Gmail, Outlook e iCloud.
- [ ] **E4** Email di invito ai 628 contatti (16/11): un solo invio, che chiede di iscriversi alla lista Avvento. **Non** iscriverli d'ufficio.
- [ ] **E5** Importare i 28 iscritti WPForms (senza prove) nella newsletter normale.
- [ ] **E6** Template dell'email del giorno (B4) + 25 campagne programmate + email di benvenuto + email di Natale.
- [ ] **E7** Non caricare la lista contatti su Meta per le inserzioni (manca un consenso specifico).

---

## 7. Articolo del blog — `effataitalia.it` (WordPress)

- Titolo proposto: *"Ogni mattina una finestra sull'Uganda: il calendario dell'Avvento di Effatà"*.
- Contenuto: 25 finestre, disegni e versi dei bambini, la voce che li legge, chi è Silvia; 2–3 disegni e una foto.
- Modulo Brevo incorporato (blocco HTML) → **verificare con Complianz** che non venga bloccato.
- Pulsante "Vuoi già regalare un disegno?" → `/natale?da=blog`.
- Articolo **in evidenza** (fisso in cima) per novembre e dicembre.
- Online entro il 15/11. Si può pubblicare in bozza dal bot (`wordpressAPI.js`).

---

## 8. Decisioni aperte

| # | Decisione | Opzioni | Proposta |
|---|---|---|---|
| D1 | Chi pubblica | Bot alle 7:30 (B3) · Facebook programmato via API + Instagram a mano (B5) · tutto a mano in Business Suite | Facebook programmato (visibile a tutti), Instagram dal bot |
| D2 | Email | Campagne Brevo programmate · invio dal bot dopo la pubblicazione | Campagne Brevo programmate |
| D3 | Formato giorni con verso | A (foto) · B (carrellata) | A di base, B nei giorni di vendita, si decide di volta in volta |
| D4 | Ultimo momento per acquistare | Fino al 24/12 sera · anche il 25 | Da decidere: serve per i testi dell'ultima settimana |
| D5 | Pagina Facebook ufficiale | `effataitalia` · `profile.php?id=61576427205615` | Una sola per tutta la campagna |
| D6 | Musica nei Reel | Nessuna · sottofondo senza diritti | Prima prova senza |

---

## 9. Piano di prova

1. **Sito (C1–C4):** in locale e poi in produzione con vendita spenta → `?oggi=` + `?disegno=` + `?da=`; un acquisto reale da 20 € con rimborso, per verificare `canale` in Stripe e nell'export.
2. **Contenuti:** generare tutti i 26 giorni → revisione umana di testi e video (lista di controllo nel piano CSV).
3. **Bot:** `AVVENTO_DRY_RUN=true` + `AVVENTO_OGGI` per 3 giorni tipo (disegno, verso A, verso B) → poi pubblicazione reale **in bozza** sulla Pagina → controllo da telefono.
4. **Email:** invio di prova a 3–4 indirizzi interni per ogni tipo (benvenuto, giorno con disegno, giorno con verso, Natale).
5. **Prova generale 27/11:** simulare il 1° dicembre dall'inizio alla fine (post, storia, email, click sul link, acquisto di prova).
6. **Dicembre:** controllo ogni mattina dei messaggi Telegram; a metà mese contare le vendite per canale (`canale` in Stripe) e spostare il budget delle sponsorizzazioni.
