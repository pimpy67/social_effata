import { logger } from "./logger.js";
import { getMetaAPI, getEmailAPI, CATEGORY_COMMENT_KEYWORD } from "./telegramBot.js";
import { matchesShareConfirmation, getWeeklyShareThankYouMessage } from "./shareKeyword.js";

function matchesKeyword(text, keyword) {
  return !!text && text.toUpperCase().includes(keyword.toUpperCase());
}

// GET /webhook/meta — verifica una tantum richiesta da Meta quando si configura il
// webhook nel pannello sviluppatori (Prodotti > Webhooks > sottoscrizione Pagina/IG).
export function verifyMetaWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    logger.info("Webhook Meta verificato con successo");
    return res.status(200).send(challenge);
  }

  logger.warn("Verifica webhook Meta fallita (token non corrispondente)");
  return res.sendStatus(403);
}

// Estrae i commenti "aggiunti" da un evento webhook: formati diversi per lo stesso
// concetto tra Pagina Facebook (object="page", field="feed", item="comment") e
// Instagram (object="instagram", field="comments").
function extractComments(body) {
  const comments = [];

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (
        body.object === "page" &&
        change.field === "feed" &&
        change.value?.item === "comment" &&
        change.value?.verb === "add"
      ) {
        comments.push({
          platform: "facebook",
          commentId: change.value.comment_id,
          text: change.value.message || "",
          authorName: change.value.sender_name || null,
          postId: change.value.post_id || null,
        });
      }

      if (body.object === "instagram" && change.field === "comments") {
        comments.push({
          platform: "instagram",
          commentId: change.value.id,
          text: change.value.text || "",
          authorName: change.value.from?.username || null,
          postId: change.value.media?.id || null,
        });
      }
    }
  }

  return comments;
}

async function processComment(comment) {
  const metaAPI = getMetaAPI();
  const emailAPI = getEmailAPI();

  const matchedKeyword = Object.values(CATEGORY_COMMENT_KEYWORD).find((keyword) =>
    matchesKeyword(comment.text, keyword)
  );

  if (matchedKeyword && emailAPI) {
    let permalink = null;
    if (comment.platform === "facebook" && comment.postId && metaAPI) {
      try {
        permalink = await metaAPI.getFacebookPostPermalink(comment.postId);
      } catch (err) {
        logger.warn(`Impossibile recuperare il permalink per l'alert commento: ${err.message}`);
      }
    }

    await emailAPI.sendKeywordAlert({
      keyword: matchedKeyword,
      commentText: comment.text,
      authorName: comment.authorName,
      platform: comment.platform,
      permalink,
    });
  }

  if (matchesShareConfirmation(comment.text) && metaAPI) {
    try {
      const thankYouMessage = getWeeklyShareThankYouMessage();
      if (comment.platform === "facebook") {
        await metaAPI.replyToFacebookComment(comment.commentId, thankYouMessage);
      } else {
        await metaAPI.replyToInstagramComment(comment.commentId, thankYouMessage);
      }
      logger.info(`Risposta di ringraziamento inviata al commento ${comment.commentId} (${comment.platform})`);
    } catch (err) {
      logger.error(`Errore nella risposta di ringraziamento al commento ${comment.commentId}: ${err.message}`);
    }
  }
}

// POST /webhook/meta — evento reale (nuovo commento, ecc). Meta si aspetta una
// risposta 200 entro pochi secondi: si risponde subito e si elabora l'evento dopo,
// altrimenti un ritardo nelle chiamate a Graph API (email, risposta pubblica)
// rischia il timeout e Meta ripete la stessa notifica più volte.
export function handleMetaWebhookEvent(req, res) {
  res.sendStatus(200);

  const comments = extractComments(req.body || {});
  for (const comment of comments) {
    processComment(comment).catch((err) => {
      logger.error(`Errore nell'elaborazione del commento webhook: ${err.message}`);
    });
  }
}
