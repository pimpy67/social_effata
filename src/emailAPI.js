import nodemailer from "nodemailer";
import { logger } from "./logger.js";

const SOCIAL_LINKS_HTML = `Seguici ed iscriviti nei nostri social:
<a href="https://effataitalia.it/iscriviti/">Sito web</a> -
<a href="https://www.instagram.com/effata_charity_organisation">Instagram</a> -
<a href="https://www.facebook.com/profile.php?id=61576427205615">Facebook</a> -
<a href="https://www.youtube.com/@EFFATAUGANDA">YouTube</a>`;

// Immagine di chiusura fissa (caricata una volta sola nella libreria media di
// WordPress con scripts/upload-image.js, per avere un URL pubblico stabile senza
// doverla ricaricare a ogni invio). Nessun limite di larghezza (niente cap a
// 600px): riempie tutto lo spazio che il client email lascia al contenuto. Il
// margine bianco più esterno attorno all'intero messaggio è aggiunto dal client
// (es. Gmail) stesso e non è eliminabile dall'HTML della mail.
const FOOTER_IMAGE_HTML = `<img src="https://effataitalia.it/wp-content/uploads/2026/08/email-header-silvia.jpg" alt="Effatà Italia" width="100%" style="width:100%;height:auto;display:block;" />`;

// Testo fisso di ringraziamento per le adozioni scolastiche a distanza, adattato dal
// facsimile usato per le risposte alle richieste di certificazione di donazione.
// sponsorName/childName possono mancare (campo skippato dal volontario con "-"):
// in quel caso si usano formule generiche invece di lasciare un buco nel testo.
function buildAdoptionThankYouEmail(sponsorName, childName) {
  // Solo il nome (non il cognome): "Andrea Pavan" -> "Andrea". "Gentile" invece di
  // una formula con genere (es. "Carissima/o") perché dal solo nome non si può
  // dedurre il genere in modo affidabile (es. "Andrea" è maschile in Italia, ma
  // femminile in altri paesi).
  const firstName = sponsorName ? sponsorName.trim().split(/\s+/)[0] : null;
  const greeting = firstName ? `Gentile <strong>${firstName}</strong>` : "Gentile sostenitore";
  const childRef = childName ? `<strong>${childName}</strong>` : "un bambino della nostra comunità";

  const subject = "Grazie per il tuo sostegno, Effatà Italia ❤️";

  const html = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
<tr><td style="padding:24px 16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#333333;">

<p>${greeting},</p>

<p>innanzitutto, grazie di cuore per il Tuo aiuto, indispensabile per sostenere i progetti e le attività di Effatà Charity Organisation in Uganda.</p>

<p>Con la tua adozione scolastica a distanza stai permettendo a ${childRef} di continuare a studiare, sognare e costruire il proprio futuro: un gesto che fa una differenza reale, ogni giorno.</p>

<p>Se vuoi, ricordati anche del 5&times;1000: non Ti costa nulla, ma per loro vale moltissimo. Basta inserire il nostro codice fiscale <strong>92050910261</strong> alla voce "sostegno degli enti del terzo settore iscritti nel RUNTS" della dichiarazione dei redditi.</p>

<p>Ti ricordiamo anche l'iniziativa dei regali solidali: per un compleanno o un'occasione speciale, puoi sostenere la Casa Famiglia attraverso il nostro <a href="https://calendario.effataitalia.it/">calendario solidale</a>.</p>

<p>Grazie ancora del Tuo grande cuore...</p>

<p>Se non l'hai già fatto, iscriviti e seguici sui nostri canali — e se conosci qualcuno che potrebbe voler sostenere un progetto come questo, parlagliene: ogni nuovo sostenitore fa la differenza.</p>

<p>${SOCIAL_LINKS_HTML}</p>

<p>Un caro saluto,<br/>
Il team di Effatà Italia ODV</p>

</td></tr>
<tr><td>${FOOTER_IMAGE_HTML}</td></tr>
</table>`;

  return { subject, html };
}

class EmailAPI {
  constructor(transporter, fromAddress) {
    this.transporter = transporter;
    this.fromAddress = fromAddress;
  }

  // Manda la mail fissa di ringraziamento per un'adozione scolastica a distanza.
  async sendAdoptionThankYou(toEmail, sponsorName, childName) {
    const { subject, html } = buildAdoptionThankYouEmail(sponsorName, childName);

    try {
      await this.transporter.sendMail({
        from: `"Effatà Italia ODV" <${this.fromAddress}>`,
        to: toEmail,
        subject,
        html,
      });
      logger.info(`Mail di ringraziamento adozione inviata a ${toEmail}`);
      return { success: true };
    } catch (err) {
      logger.error(`Errore nell'invio della mail di ringraziamento a ${toEmail}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}

export async function initEmailAPI() {
  const user = process.env.EMAIL_USER;
  const appPassword = process.env.EMAIL_APP_PASSWORD;

  if (!user || !appPassword) {
    logger.warn("Email API non configurata (mancano EMAIL_USER/EMAIL_APP_PASSWORD in .env)");
    return null;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass: appPassword },
  });

  logger.info("Email API inizializzata");
  return new EmailAPI(transporter, user);
}
