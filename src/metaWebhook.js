import { logger } from "./logger.js";
import { getMetaAPI, getEmailAPI, CATEGORY_COMMENT_KEYWORD } from "./telegramBot.js";
import { matchesShareConfirmation, getWeeklyShareThankYouMessage, SHARE_CTA_COMMENT } from "./shareKeyword.js";

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
          authorName: change.value.from?.name || change.value.sender_name || null,
          authorId: change.value.from?.id || change.value.sender_id || null,
          postId: change.value.post_id || null,
        });
      }

      if (body.object === "instagram" && change.field === "comments") {
        comments.push({
          platform: "instagram",
          commentId: change.value.id,
          text: change.value.text || "",
          authorName: change.value.from?.username || null,
          authorId: change.value.from?.id || null,
          postId: change.value.media?.id || null,
        });
      }
    }
  }

  return comments;
}

// Il bot pubblica lui stesso, come Pagina, un commento CTA dopo ogni post
// ("Condividi questo post e scrivici CONDIVISO...") e le risposte di
// ringraziamento: anche questi arrivano dal webhook come nuovi commenti. Senza
// questo filtro il riconoscimento della parola chiave scatterebbe sul nostro
// stesso commento CTA (che contiene "CONDIVISO") e Silvia finirebbe per
// "ringraziare se stessa" prima ancora che qualcuno condivida davvero.
function isOwnComment(comment, metaAPI) {
  if (comment.text && comment.text.trim() === SHARE_CTA_COMMENT.trim()) return true;
  const ownIds = [process.env.META_PAGE_ID, metaAPI?.instagramAccountId]
    .filter(Boolean)
    .map(String);
  return !!comment.authorId && ownIds.includes(String(comment.authorId));
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
        await metaAPI.sendFacebookPrivateReply(comment.commentId, thankYouMessage);
      } else {
        await metaAPI.sendInstagramPrivateReply(comment.commentId, thankYouMessage);
      }
      logger.info(`Messaggio privato di ringraziamento inviato all'autore del commento ${comment.commentId} (${comment.platform})`);
    } catch (err) {
      // Cause tipiche: manca il permesso pages_messaging/instagram_manage_messages
      // sul token, commento più vecchio di 7 giorni, o l'utente non accetta
      // messaggi dalla Pagina. Non si ripiega su una risposta pubblica: il senso
      // di questo ringraziamento è che resti privato.
      logger.error(`Impossibile inviare il messaggio privato di ringraziamento al commento ${comment.commentId} (${comment.platform}): ${err.response?.data?.error?.message || err.message}`);
    }
  }
}

// POST /webhook/meta — evento reale (nuovo commento, ecc). Meta si aspetta una
// risposta 200 entro pochi secondi: si risponde subito e si elabora l'evento dopo,
// altrimenti un ritardo nelle chiamate a Graph API (email, risposta pubblica)
// rischia il timeout e Meta ripete la stessa notifica più volte.
export function handleMetaWebhookEvent(req, res) {
  res.sendStatus(200);

  const metaAPI = getMetaAPI();
  const comments = extractComments(req.body || {});
  for (const comment of comments) {
    if (isOwnComment(comment, metaAPI)) {
      logger.debug(`Commento del bot stesso ignorato dal webhook (${comment.platform}, ${comment.commentId})`);
      continue;
    }
    processComment(comment).catch((err) => {
      logger.error(`Errore nell'elaborazione del commento webhook: ${err.message}`);
    });
  }
}
