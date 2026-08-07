import nodemailer from "nodemailer";
import { logger } from "./logger.js";

const SOCIAL_LINKS_HTML = `Seguici ed iscriviti nei nostri social:
<a href="https://effataitalia.it/iscriviti/">Sito web</a> -
<a href="https://www.instagram.com/effata_charity_organisation">Instagram</a> -
<a href="https://www.facebook.com/profile.php?id=61576427205615">Facebook</a> -
<a href="https://www.youtube.com/@EFFATAUGANDA">YouTube</a>`;

// Testo fisso di ringraziamento per le adozioni scolastiche a distanza, adattato dal
// facsimile usato per le risposte alle richieste di certificazione di donazione.
// sponsorName/childName possono mancare (campo skippato dal volontario con "-"):
// in quel caso si usano formule generiche invece di lasciare un buco nel testo.
function buildAdoptionThankYouEmail(sponsorName, childName) {
  const greeting = sponsorName ? `Carissim_ ${sponsorName}` : "Carissim_ sostenitore";
  const childRef = childName || "un bambino della nostra comunità";

  const subject = "Grazie per il tuo sostegno, Effatà Italia ❤️";

  const html = `<p>${greeting},</p>

<p>innanzitutto, grazie di cuore per il Tuo aiuto, indispensabile per sostenere i progetti e le attività di Effatà Charity Organisation in Uganda.</p>

<p>Con la tua adozione scolastica a distanza stai permettendo a ${childRef} di continuare a studiare, sognare e costruire il proprio futuro: un gesto che fa una differenza reale, ogni giorno.</p>

<p>Se vuoi, ricordati anche del 5&times;1000: non Ti costa nulla, ma per loro vale moltissimo. Basta inserire il nostro codice fiscale <strong>92050910261</strong> alla voce "sostegno degli enti del terzo settore iscritti nel RUNTS" della dichiarazione dei redditi.</p>

<p>Grazie ancora del Tuo grande cuore...</p>

<p>${SOCIAL_LINKS_HTML}</p>

<p>Un caro saluto,<br/>
Il team di Effatà Italia ODV</p>`;

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
