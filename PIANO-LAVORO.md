# Come organizzarci come volontari

Piano di lavoro per accessi, tracciabilità delle pubblicazioni e riduzione dell'attrito nel passaggio foto → bozza → post pubblicato, dal PC e dal telefono.

*01/08/2026 — Bozza per discussione. Aggiornato 01/08/2026: Fase A completata (A1, A2, A3) e verificata in produzione.*

**In breve:** 8 categorie di storia già attive nel bot · 2 canali su 2 con bozza automatica via API (Facebook e Instagram) · dashboard protetta da password condivisa e con stato/nome volontario per ogni bozza.

---

## Cosa esiste già, e non lo sapevi

Prima di proporre cose nuove, due funzioni che hai chiesto sono già scritte nel codice — vanno solo accese o verificate.

### Conteggio storie per categoria, mensile e annuale — `già fatto`

I comandi `/report-mese` e `/report-anno` nel bot restituiscono già il totale per ciascuna delle 8 categorie. Fino a oggi restavano vuoti perché `/categoria` non era obbligatoria prima di `/genera` — l'ho appena reso obbligatorio, quindi da adesso i report inizieranno a popolarsi da soli.

### Pubblicazione automatica come bozza su Facebook e Instagram — `verificato in produzione`

`src/metaAPI.js` pubblica il post Facebook e la bozza Instagram direttamente sulla Pagina/account, via Graph API — elimina il trascinamento immagini: il volontario apre Meta Business Suite e clicca "Pubblica", niente download/upload a mano. Entrambi i canali verificati funzionanti il 01/08/2026 dopo aver rigenerato un Page Access Token valido con i permessi giusti (vedi A1).

---

## Il nodo vero: perché ti serve trascinare tra due schermi

Il flusso di oggi è *genera → scarica a mano → carica a mano*. Le agenzie professionali (Buffer, Hootsuite, Later, la stessa Meta Business Suite) non fanno mai quel passaggio manuale: pubblicano via API direttamente sulla pagina, e la persona si limita a un click di approvazione. Non serve un secondo schermo, non serve un PC: dal telefono è lo stesso identico click.

Il tuo progetto ha già l'impianto per farlo — `metaAPI.js` — per Facebook e Instagram. Completarlo è la mossa singola con il rapporto beneficio/sforzo più alto in questo piano: risolve il problema per i due canali che probabilmente usi di più. Per blog e LinkedIn, dove un'API affidabile non è disponibile o è troppo complessa da ottenere, il lavoro resta manuale — ma lì è solo testo da copiare, e il copia-incolla di testo funziona bene anche da telefono.

---

## Roadmap proposta

In ordine di rapporto beneficio/sforzo. Nessuna fase presuppone la precedente conclusa al 100% — sono priorità, non blocchi.

### Fase A — ora, basso sforzo / alto impatto

| # | Cosa | Perché |
|---|------|--------|
| A1 | **Sbloccare Meta API per Instagram** — `fatto` | Il vero problema non erano i permessi Instagram: il `META_PAGE_ACCESS_TOKEN` era scaduto da giorni, il che aveva rotto silenziosamente anche Facebook. Rigenerato un Page Access Token a lunga durata con anche `instagram_basic`/`instagram_content_publish`; verificato in produzione — l'account Instagram Business risulta ora collegato e leggibile dall'API. |
| A2 | **Stato bozza + nome di chi pubblica** — `fatto` | Tre stati per ogni bozza — *da pubblicare*, *in lavorazione*, *pubblicato* — più il nome del volontario, salvati nel database e visibili in dashboard con bottoni dedicati. Nome volontario ricordato dal browser tra una sessione e l'altra. |
| A3 | **Accesso condiviso alla dashboard** — `fatto` | Password condivisa via Basic Auth su Nginx (utente `volontari`), verificata in produzione su bot.effataitalia.it: la dashboard ora richiede login prima di mostrare qualsiasi bozza. |

### Fase B — dopo, medio sforzo

| # | Cosa | Perché |
|---|------|--------|
| B1 | **Bottone "prendo in carico"** | Marca una storia come in lavorazione da una persona specifica, visibile a tutti al refresh della pagina — evita che due volontari pubblichino la stessa storia due volte, senza bisogno di aggiornamenti in tempo reale. |
| B2 | **Scarica tutto in un colpo (zip)** | Per i canali senza pubblicazione via API (blog, LinkedIn): un bottone che impacchetta testo e foto della bozza in uno zip, comodo da desktop. |
| B3 | **Condivisione diretta da mobile** | Un bottone "condividi foto" che sul telefono apre il menu nativo di condivisione e passa l'immagine direttamente all'app Instagram/Facebook, senza salvarla prima in galleria. |

### Fase C — solo se serve davvero

| # | Cosa | Perché |
|---|------|--------|
| C1 | **Account individuali con login vero** | Ha senso solo se il gruppo di volontari cresce molto o serve un audit più stringente di chi ha fatto cosa. Fino ad allora, la password condivisa più il nome scelto manualmente (Fase A3 + A2) copre lo stesso bisogno con una frazione dello sforzo. |
| C2 | **LinkedIn e blog via API** | LinkedIn richiede un'approvazione aziendale non banale da ottenere. Il blog, se gira su WordPress, è fattibile in bozza via REST API — ma è testo, quindi il copia-incolla manuale resta comunque accettabile anche a lungo termine. |

---

## Confronto: prima vs. dopo Fase A (completata il 01/08/2026)

| Passaggio | Prima | Ora |
|---|---|---|
| Pubblicare su Facebook | Scarica foto, apri FB, trascina, incolla testo | Apri Meta Business Suite, clicca "Pubblica" |
| Pubblicare su Instagram | Scarica foto, apri IG, carica, incolla testo | Apri Meta Business Suite, clicca "Pubblica" |
| Sapere chi ha pubblicato cosa | Non tracciato | Visibile in dashboard per ogni bozza |
| Evitare doppioni tra volontari | Solo coordinandosi a voce/chat | Stato "in lavorazione" visibile a tutti |
| Accesso alla dashboard | URL pubblico, nessuna protezione | Protetto da password condivisa |

---

## Domande a cui rispondere prima di iniziare

**Chi ha accesso alla Pagina Facebook e all'account Instagram Business come amministratore?**
Serve per generare/verificare il `META_PAGE_ACCESS_TOKEN` giusto — è il primo passo pratico della Fase A1.

**Quanti volontari useranno la dashboard, in modo continuativo?**
Se restano pochi (indicativamente sotto una decina) la password condivisa (A3) basta; oltre quella soglia comincia ad avere senso valutare account individuali (C1).

**Il blog di effataitalia.it è su WordPress?**
Da confermare — condiziona se C2 (bozza blog via API) è realisticamente fattibile o no.

---

## Prossimo passo

Fase A completata (A1, A2, A3) e verificata in produzione il 01/08/2026. Il prossimo passo naturale è scegliere da dove iniziare la Fase B — B1 (bottone "prendo in carico"), B2 (zip bozze) e B3 (condivisione mobile) sono indipendenti tra loro.

**Nota operativa per manutenzione futura:** il `META_PAGE_ACCESS_TOKEN` è ora un token di sistema/pagina a lunga durata, ma non è impostato per non scadere mai in senso assoluto — se in futuro tornano errori "Session has expired" nei log, va rigenerato seguendo la stessa procedura (Graph API Explorer → estendi token → `me/accounts` per il Page Access Token). Sul server, usare sempre `docker compose` (con lo spazio, non `docker-compose` con il trattino) per evitare il bug di ricreazione container riscontrato il 01/08/2026.
