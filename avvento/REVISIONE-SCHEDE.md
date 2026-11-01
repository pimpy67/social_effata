# Avvento 2026 — revisione delle schede

Metodo concordato con Andrea (22/10/2026): a ogni sessione si riparte dalla **prima scheda non ancora approvata** e si va avanti in ordine. Per ogni scheda si guardano visual, testi Facebook/Instagram, storia, email e punti aperti; le correzioni approvate sono **definitive**.

Materiale: pacchetto in `social_effata/avvento/` sul Mac (script in `strumenti/`: `contenuti.py` per i testi, `genera_media.py` per immagini e video).
Stile visivo (approvato come direzione il 22/10): come la pagina natale-avvento del sito — foto di Silvia con velo blu-viola, neve, Poppins, finestre con bordo oro e numero, versi su cartoncino crema in Patrick Hand dorato.
Audio: **non ci sono ancora** le registrazioni vere (i Reel usano la voce di prova gTTS).

## Stato delle schede
| # | Data | Scheda | Formato | Stato | Note di revisione |
|---|---|---|---|---|---|
| 1 | 2026-11-29 | Lancio · prima domenica d'Avvento | reel_lancio + storia video | **approvata** (22/10) | Riscritta il 22/10 sera: Reel che spiega l'iniziativa in 6 passaggi (date, una finestra al giorno con la griglia del sito, filastrocca, disegni sul sito, gift card, regalo solidale 20 €); testi FB/IG riscritti; musica carillon. Aggiunto invito all'iscrizione (effataitalia.it/iscriviti). Sponsorizzazione: importo deciso il giorno della pubblicazione. |
| 2 | 2026-12-01 | Finestra 1 · Mani che si incontrano · Giving Tuesday | post video + storia video | in revisione | 22/10: riga oro della storia a metà, riquadro del link con l'indirizzo; Giving Tuesday confermato; aggiunti i 4 passi "come si regala" nei testi e come seconda schermata dei video (14 s). |
| 3 | 2026-12-02 | Finestra 2 · L'Uganda è lontana | reel_A | da rivedere | |
| 4 | 2026-12-03 | Finestra 3 · Il mondo intorno a una casa | post | da rivedere | |
| 5 | 2026-12-04 | Finestra 4 · Spazi sereni | reel_A | da rivedere | |
| 6 | 2026-12-05 | Finestra 5 · Luci e comodità | post | da rivedere | |
| 7 | 2026-12-06 | Finestra 6 · Casette di fango | reel_A | da rivedere | |
| 8 | 2026-12-07 | Finestra 7 · Il villaggio | post | da rivedere | |
| 9 | 2026-12-08 | Finestra 8 · A piedi scalzi · Immacolata | reel_B | da rivedere | |
| 10 | 2026-12-09 | Finestra 9 · Il sentiero | post | da rivedere | |
| 11 | 2026-12-10 | Finestra 10 · Mani che lavorano | reel_A | da rivedere | |
| 12 | 2026-12-11 | Finestra 11 · Al fiume | post | da rivedere | |
| 13 | 2026-12-12 | Finestra 12 · Senza brontolare · vigilia di Santa Lucia | reel_B | da rivedere | |
| 14 | 2026-12-13 | Finestra 13 · In cucina · Santa Lucia | post | da rivedere | |
| 15 | 2026-12-14 | Finestra 14 · Natura e immaginazione | reel_A | da rivedere | |
| 16 | 2026-12-15 | Finestra 15 · Due stanze, fronte e retro | carosello | da rivedere | |
| 17 | 2026-12-16 | Finestra 16 · Colori di bacche e frutta | post | da rivedere | |
| 18 | 2026-12-17 | Finestra 17 · Disegnano | reel_A | da rivedere | |
| 19 | 2026-12-18 | Finestra 18 · Un giaciglio | post | da rivedere | |
| 20 | 2026-12-19 | Finestra 19 · Arriva qualcuno | post | da rivedere | |
| 21 | 2026-12-20 | Finestra 20 · Silvia | reel_A | da rivedere | |
| 22 | 2026-12-21 | Finestra 21 · La scuola e il cortile | carosello | da rivedere | |
| 23 | 2026-12-22 | Finestra 22 · Scuole, case, materassi | reel_B | da rivedere | |
| 24 | 2026-12-23 | Finestra 23 · Un cuore solo | post | da rivedere | |
| 25 | 2026-12-24 | Finestra 24 · Anche noi · Vigilia | reel_B | da rivedere | |
| 26 | 2026-12-25 | Finestra 25 · Buon Natale | carosello | da rivedere | |

## Decisioni generali
- 22/10: **quando non c'è la filastrocca, ogni contenuto ha la musica di Natale** (Reel, post e storie). Quindi anche i post dei giorni con il disegno e le storie diventano **video** con musica e neve che cade (le foto non possono avere musica via API). Musica: "Astro del ciel" (Gruber, 1818, pubblico dominio) suonata da un carillon sintetizzato, senza diritti; si può sostituire con un brano scelto da voi.
- 22/10: **sponsorizzazioni**: l'articolo del blog sui social dal 20 novembre; gli **importi si decidono il giorno della pubblicazione** (le cifre del piano v3 sono solo indicative).
- 22/10: **iscrizione all'email quotidiana** con la pagina esistente https://effataitalia.it/iscriviti/ (stessa per newsletter e calendario). L'articolo del blog con l'invito si sponsorizza sui social **dal 20 novembre**; l'invito a iscriversi resta nei testi dei post **almeno per la prima settimana** (lancio e 1–7 dicembre).
  - Da sviluppare sul sito: nel modulo `[effata_form_newsletter]` (tema, functions.php) una casella separata "Ricevi ogni mattina la finestra del Calendario dell'Avvento" e l'invio automatico degli iscritti a Brevo (liste Newsletter / Avvento). Oggi il modulo salva solo nel database del sito e manda una email all'admin.
- Nei giorni con il verso il sonoro è la voce che legge il verso (oggi voce di prova, poi le registrazioni vere).

- 22/10: **riquadro dello sticker Link** nelle storie: contiene l'indirizzo scritto `calendario.effataitalia.it/natale`, così non resta vuoto se lo sticker non viene messo.
- 22/10: **carrellate dei disegni più lente**: 1,6 secondi per disegno (lancio e Reel "tutti i disegni"). La durata dei video non ha limiti stretti (Reel fino a 90 s, storie fino a 60 s): oggi post e storie durano 12 s.

- 22/10: **come si regala, il più spesso possibile**: in ogni scheda fino al 24 dicembre i testi hanno i 4 passi (scegli il disegno → nome di chi lo riceve e messaggio → paga 20 € con carta o Satispay → arriva per email o WhatsApp e si apre il 24 a mezzanotte). Nei video dei giorni con il disegno, dopo il disegno arriva una seconda schermata con gli stessi 4 passi.
- 22/10: **email quotidiana**: un solo modello, sempre uguale; cambia solo il contenuto del giorno.
- 22/10: il piano editoriale va archiviato in **Notion** (dispensa di Andrea). Prima prova di creazione interrotta da Andrea: da chiarire dove crearlo.

## Punti aperti generali
- Autori dei disegni (copertina finestra 25: libro di Erika Porro, illustrazioni di Lara Dalla Riva).
- Registrazioni audio vere dei versi (12 file: 2, 4, 6, 8, 10, 12, 14, 17, riga del giaciglio, 20, 22, 24).
- Consenso di Silvia per le foto con i bambini.
- Fino a quando si può comprare la gift card (23–24 dicembre).
- Articolo del blog con il modulo Brevo per l'iscrizione all'email quotidiana.

