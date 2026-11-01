# Avvento 2026 — contenuti social (bozza da approvare)

Preparato il 22/10/2026. Tutto è una **bozza**: testi e immagini vanno approvati prima di programmarli.

## Cosa c'è
- Una cartella per ogni giorno, dal **29/11** (lancio) al **25/12**. In ogni cartella:
  - `post.jpg` (4:5) oppure `post-1.jpg` e `post-2.jpg` (carosello) oppure `reel.mp4` (9:16);
  - `storia.jpg` (9:16), con lo spazio vuoto in basso per lo **sticker Link** di Instagram;
  - `facebook.txt` e `instagram.txt` con il testo del giorno.
- `testi.csv`: tutti i testi in un foglio solo, comodo per l'approvazione (si apre con Excel o Numbers). Contiene anche l'oggetto dell'email e il link dello sticker di ogni storia.
- `piano.json`: l'indice di tutti i giorni, per il bot.
- `strumenti/`: gli script per rigenerare tutto. Si modifica `contenuti.py` e poi si lancia `genera_media.py`.

## Lo schema
- **Giorni con disegno** (1, 3, 5, 7, 9, 11, 13, 16, 18, 19, 23): post con il disegno, il pulsante "Regala questo disegno · 20 €" e nel testo il verso del giorno dopo.
- **Giorni 15 e 21**: carosello fronte e retro.
- **Giorni con verso, versione A** (2, 4, 6, 10, 14, 17, 20): Reel con la foto di Silvia, il verso scritto, la voce e alla fine il disegno del giorno prima da regalare.
- **Giorni con verso, versione B** (8, 12, 22, 24: Immacolata, Santa Lucia, ultimo minuto, Vigilia): Reel con il verso e la carrellata di tutti i disegni da scegliere.
- **29/11, lancio**: Reel con la carrellata, senza voce.
- **25/12, Natale**: carosello con il presepe e gli auguri.

Tutti i link usano l'indirizzo corto con il disegno già scelto e il canale di provenienza, per esempio `calendario.effataitalia.it/natale?disegno=5&da=fb`.

## Da decidere o verificare prima di programmare
1. **Chi ha fatto i disegni.** I testi dicono "i disegni della nostra filastrocca", non "dei bambini della Casa Famiglia". La finestra 25 è la copertina di un libro, *"I Bambini salveranno il Natale"* di Erika Porro, con le illustrazioni di Lara Dalla Riva. Se i disegni sono di Lara Dalla Riva, o di bambini di una scuola italiana, conviene citarli. Se invece sono dei bambini di Effatà, si può dire nei testi, ed è anche più forte.
2. **La voce dei Reel è provvisoria.** Gli audio sono quelli di prova del ramo `proto/filastrocca-audio`, generati con una voce automatica (gTTS). Quando ci sarà la registrazione vera, basta sostituire i file `porta-NN.mp3` e rilanciare `genera_media.py`. Lo stesso vale per il sito: gli audio **non sono ancora su `main`**, quindi oggi la pagina online non ha il tasto "Ascolta".
3. **Le foto di Silvia** (cartella *INIZI DI SILVIA*): serve il suo consenso, perché in molte si vedono i volti dei bambini.
4. **23 e 24 dicembre**: fino a quando si può comprare la gift card, e cosa succede a chi la compra quando si è già aperta? I testi di quei giorni dicono "sei in tempo anche oggi".
5. **Iscrizione all'email quotidiana**: nel lancio c'è una nota per mettere nel primo commento il link all'articolo del blog, che non esiste ancora.
6. **Il verso del 18** ("Un giaciglio comodo…") non ha un audio suo. Oggi `porta-17.mp3` legge solo la prima riga.

## Come si rigenera
```bash
cd strumenti
python3 contenuti.py      # aggiorna piano.json e testi.csv
python3 genera_media.py <cartella assets> "<disco Extreme SSD>/EFFATA" <cartella di uscita> [AAAA-MM-GG ...]
```
La cartella `assets` deve contenere: `dis/` (porta-NN.jpg, retro-NN.jpg), `audio/` (porta-NN.mp3) e `logo-effata.png`.
