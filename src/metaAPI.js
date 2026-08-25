import axios from "axios";
import { logger } from "./logger.js";
import { validation } from "./validation.js";
import { SHARE_CTA_COMMENT } from "./shareKeyword.js";

const GRAPH_API_VERSION = "v26.0";
const GRAPH_API_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Numero massimo di slide fisse con logo/info categoria che photoOptimizer.js
// aggiunge in coda alle Storie (vedi CATEGORY_STORY_SEQUENCES in telegramBot.js):
// di solito 1, ma alcune categorie (es. "Volontariato Digitale") ne usano più di
// una in sequenza per un testo troppo lungo per stare su una sola slide. Va
// alzato se in futuro una categoria avesse bisogno di più slide di questa.
const MAX_CATEGORY_INFO_SLIDES = 3;

// Numero massimo di slide per una sequenza di Storie: il massimo di foto caricabili
// per storia (validation.js, MAX_TOTAL_PHOTOS) + le slide fisse finali con logo/info
// categoria. Senza questo margine, con una storia al limite massimo di foto lo slice
// troncava proprio le ultime slide (aggiunte in fondo all'array), facendole sparire
// dalla pubblicazione.
const MAX_STORY_SLIDES = validation.getLimits().MAX_TOTAL_PHOTOS + MAX_CATEGORY_INFO_SLIDES;

// Instagram rifiuta (code=36004) qualsiasi caption oltre 2200 caratteri, sia per
// post singoli che per caroselli: a differenza di Telegram non è possibile pubblicare
// la foto senza didascalia e mandare il testo completo a parte, quindi qui troncamo
// per non perdere la pubblicazione.
const INSTAGRAM_CAPTION_LIMIT = 2200;

// Instagram rifiuta l'elaborazione di un Reel (status_code=ERROR, senza altro
// dettaglio via API) se il video è sotto questa risoluzione minima sul lato
// corto — scoperto il 25/08/2026 con un video da 478x850 inoltrato via WhatsApp
// (che spesso comprime la risoluzione durante l'inoltro). Meglio avvisare
// chiaramente prima di provare, invece del generico errore di Meta.
export const MIN_INSTAGRAM_REEL_WIDTH = 500;

// Legge le dimensioni (width x height) del primo video track di un file MP4,
// senza dipendere da ffmpeg (non installato in produzione, per non rischiare di
// rompere la build Docker sull'immagine Alpine — stessa scelta già fatta per
// l'elaborazione foto, vedi photoOptimizer.js). Naviga a mano l'albero di box
// ftyp/moov/trak/mdia, cerca il trak con handler "vide" (per non confondersi con
// la traccia audio) e ne legge width/height da tkhd (fixed-point 16.16, ultimi 8
// byte del box). Ritorna null se non trovate (file non valido/non MP4, o
// struttura box non gestita — in quel caso si prosegue senza bloccare la
// pubblicazione, il controllo è un extra, non una validazione completa).
export function getMp4VideoDimensions(buffer) {
  function readBoxes(start, end) {
    const boxes = [];
    let offset = start;
    while (offset < end - 8) {
      let size = buffer.readUInt32BE(offset);
      let headerSize = 8;
      const type = buffer.toString("ascii", offset + 4, offset + 8);
      if (size === 1) {
        // Box con size a 64 bit (raro, file molto grandi)
        size = Number(buffer.readBigUInt64BE(offset + 8));
        headerSize = 16;
      }
      if (size < headerSize) break;
      boxes.push({ type, start: offset, end: offset + size, headerSize });
      offset += size;
    }
    return boxes;
  }

  try {
    const moov = readBoxes(0, buffer.length).find((b) => b.type === "moov");
    if (!moov) return null;

    const traks = readBoxes(moov.start + 8, moov.end).filter((b) => b.type === "trak");
    for (const trak of traks) {
      const trakChildren = readBoxes(trak.start + 8, trak.end);
      const mdia = trakChildren.find((b) => b.type === "mdia");
      if (!mdia) continue;
      const hdlr = readBoxes(mdia.start + 8, mdia.end).find((b) => b.type === "hdlr");
      if (!hdlr) continue;

      // hdlr: version(1)+flags(3)+predefined(4)+handler_type(4)...
      const handlerType = buffer.toString("ascii", hdlr.start + hdlr.headerSize + 8, hdlr.start + hdlr.headerSize + 12);
      if (handlerType !== "vide") continue;

      const tkhd = trakChildren.find((b) => b.type === "tkhd");
      if (!tkhd) continue;
      const width = buffer.readUInt32BE(tkhd.end - 8) / 65536;
      const height = buffer.readUInt32BE(tkhd.end - 4) / 65536;
      if (width > 0 && height > 0) return { width: Math.round(width), height: Math.round(height) };
    }
  } catch (err) {
    logger.warn(`Impossibile leggere le dimensioni del video: ${err.message}`);
  }
  return null;
}

function truncateInstagramCaption(text) {
  if (!text || text.length <= INSTAGRAM_CAPTION_LIMIT) return text;
  logger.warn(`Caption Instagram troppo lunga (${text.length} caratteri), troncata a ${INSTAGRAM_CAPTION_LIMIT}`);
  return `${text.slice(0, INSTAGRAM_CAPTION_LIMIT - 1)}…`;
}

// Estrae il messaggio d'errore reale restituito da Meta (es. token scaduto,
// permesso mancante) invece del generico "Request failed with status code 4xx"
// che axios mette in err.message.
function metaErrorMessage(err) {
  const metaError = err.response?.data?.error;
  return metaError ? `${metaError.message} (code=${metaError.code}, subcode=${metaError.error_subcode ?? "-"})` : err.message;
}

// Riprova un'operazione un paio di volte prima di rinunciare: usata per le
// singole slide delle Storie, dove un errore transitorio (rate limit, timeout
// nell'elaborazione Instagram) su una sola immagine non deve farla scartare
// in silenzio se il tentativo successivo va a buon fine. Logga ogni tentativo
// fallito con l'errore reale di Meta, invece di scoprirlo solo se falliscono
// tutte le slide.
async function withRetry(fn, { attempts = 3, delayMs = 1500, label = "" } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      logger.warn(`${label}: tentativo ${attempt}/${attempts} fallito (${metaErrorMessage(err)})`);
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastErr;
}

export class MetaAPI {
  constructor(pageAccessToken, pageId) {
    this.pageAccessToken = pageAccessToken;
    this.pageId = pageId;
    this.instagramAccountId = null;
  }

  async initialize() {
    try {
      await this.fetchInstagramAccountId();
      logger.info(`MetaAPI inizializzato. Instagram Account ID: ${this.instagramAccountId}`);
    } catch (err) {
      logger.warn(`Errore nell'inizializzazione MetaAPI: ${metaErrorMessage(err)}`);
    }
  }

  async fetchInstagramAccountId() {
    try {
      // Prova 1: instagram_business_account (singolare)
      try {
        const response = await axios.get(
          `https://graph.facebook.com/v26.0/${this.pageId}`,
          {
            params: {
              fields: "instagram_business_account",
              access_token: this.pageAccessToken,
            },
          }
        );

        if (response.data.instagram_business_account?.id) {
          this.instagramAccountId = response.data.instagram_business_account.id;
          return;
        }
      } catch (err1) {
        logger.debug(`Variante 1 (instagram_business_account) fallita: ${metaErrorMessage(err1)}`);
      }

      // Prova 2: instagram_business_accounts (plurale)
      try {
        const response = await axios.get(
          `https://graph.facebook.com/v26.0/${this.pageId}`,
          {
            params: {
              fields: "instagram_business_accounts",
              access_token: this.pageAccessToken,
            },
          }
        );

        if (response.data.instagram_business_accounts?.data?.length > 0) {
          this.instagramAccountId = response.data.instagram_business_accounts.data[0].id;
          return;
        }
      } catch (err2) {
        logger.debug(`Variante 2 (instagram_business_accounts) fallita: ${metaErrorMessage(err2)}`);
      }

      // Prova 3: Endpoint diretto /instagram_accounts
      try {
        const response = await axios.get(
          `https://graph.facebook.com/v26.0/${this.pageId}/instagram_accounts`,
          {
            params: {
              access_token: this.pageAccessToken,
            },
          }
        );

        if (response.data.data?.length > 0) {
          this.instagramAccountId = response.data.data[0].id;
          return;
        }
      } catch (err3) {
        logger.debug(`Variante 3 (/instagram_accounts) fallita: ${metaErrorMessage(err3)}`);
      }

      logger.warn("Instagram Business Account non trovato - tutte le varianti fallite");
    } catch (err) {
      logger.error(`Errore nel recupero Instagram Account ID: ${metaErrorMessage(err)}`);
    }
  }

  // Carica una foto come "non pubblicata": serve per allegarla in un secondo
  // momento a un post con più foto tramite attached_media.
  async uploadUnpublishedPhoto(imageBuffer) {
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: "image/jpeg" });
    formData.append("source", blob, "image.jpg");
    formData.append("published", "false");

    const response = await axios.post(
      `https://graph.facebook.com/v26.0/${this.pageId}/photos`,
      formData,
      {
        params: {
          access_token: this.pageAccessToken,
        },
      }
    );

    return response.data.id;
  }

  // Instagram non accetta l'upload diretto del file per creare un media: vuole un
  // image_url pubblico che i suoi server possano scaricare da soli. Riusiamo il
  // caricamento come "foto non pubblicata" su Facebook (sopra) per ottenere un URL
  // sul CDN di Facebook, pubblico ma senza comparire nella pagina.
  async getPublicImageUrl(imageBuffer) {
    const photoId = await this.uploadUnpublishedPhoto(imageBuffer);

    const response = await axios.get(`https://graph.facebook.com/v26.0/${photoId}`, {
      params: {
        fields: "images",
        access_token: this.pageAccessToken,
      },
    });

    const images = response.data.images;
    if (!images || images.length === 0) {
      throw new Error("Impossibile ottenere un URL pubblico per l'immagine");
    }

    return images[0].source;
  }

  async publishToFacebook(text, imageBuffers) {
    if (!this.pageAccessToken || !this.pageId) {
      logger.warn("Meta API: pageAccessToken o pageId non configurati");
      return { success: false, error: "Credenziali Meta mancanti" };
    }

    const photos = (Array.isArray(imageBuffers) ? imageBuffers : imageBuffers ? [imageBuffers] : []).filter(Boolean);

    try {
      const formData = new FormData();
      formData.append("message", text);
      formData.append("published", "false"); // Pubblica come bozza

      if (photos.length === 1) {
        const blob = new Blob([photos[0]], { type: "image/jpeg" });
        formData.append("source", blob, "image.jpg");
      } else if (photos.length > 1) {
        // Facebook richiede di caricare ogni foto come "non pubblicata" e poi
        // allegarle tutte a un unico post tramite attached_media.
        const photoIds = await Promise.all(photos.map((buf) => this.uploadUnpublishedPhoto(buf)));
        formData.append("attached_media", JSON.stringify(photoIds.map((id) => ({ media_fbid: id }))));
      }

      const response = await axios.post(
        `https://graph.facebook.com/v26.0/${this.pageId}/feed`,
        formData,
        {
          params: {
            access_token: this.pageAccessToken,
          },
        }
      );

      logger.info(`Post Facebook pubblicato (bozza) con ${photos.length} foto: ${response.data.id}`);
      return { success: true, postId: response.data.id, platform: "facebook" };
    } catch (err) {
      const message = metaErrorMessage(err);
      logger.error(`Errore nella pubblicazione Facebook: ${message}`);
      return { success: false, error: message, platform: "facebook" };
    }
  }

  // Pubblica davvero (rende visibile sulla pagina) un post Facebook creato in
  // precedenza come bozza non pubblica con publishToFacebook.
  async publishFacebookDraft(postId) {
    await axios.post(`https://graph.facebook.com/v26.0/${postId}`, null, {
      params: {
        is_published: true,
        access_token: this.pageAccessToken,
      },
    });
    // Non await-ato di proposito: il commento CTA è un extra, non deve ritardare
    // né far fallire la risposta al volontario che ha appena reso pubblico il post.
    this.postFacebookShareCta(postId);
  }

  // Il link diretto al post esiste solo dopo che è stato reso pubblico
  // (non per le bozze non pubblicate): va richiesto dopo publishFacebookDraft.
  async getFacebookPostPermalink(postId) {
    const response = await axios.get(`https://graph.facebook.com/v26.0/${postId}`, {
      params: {
        fields: "permalink_url",
        access_token: this.pageAccessToken,
      },
    });
    return response.data.permalink_url || null;
  }

  // Pubblica una o più Storie Facebook (contenuto effimero, sparisce dopo 24h), in
  // aggiunta al post normale. Una Storia mostra sempre una sola foto: con più foto
  // ne pubblica una in sequenza per ciascuna (chi guarda le scorre una dopo l'altra).
  // A differenza dei post, vanno online subito: non esiste una "bozza" per le Storie.
  async publishFacebookStory(imageBuffers) {
    if (!this.pageAccessToken || !this.pageId) {
      logger.warn("Meta API: pageAccessToken o pageId non configurati");
      return { success: false, error: "Credenziali Meta mancanti" };
    }

    const photos = (Array.isArray(imageBuffers) ? imageBuffers : imageBuffers ? [imageBuffers] : [])
      .filter(Boolean)
      .slice(0, MAX_STORY_SLIDES);

    if (photos.length === 0) {
      return { success: false, error: "Immagine richiesta per la Storia Facebook" };
    }

    const storyIds = [];
    const errors = [];

    for (const [index, buffer] of photos.entries()) {
      const label = `Storia Facebook slide ${index + 1}/${photos.length}`;
      try {
        const storyId = await withRetry(async () => {
          const photoId = await this.uploadUnpublishedPhoto(buffer);
          const response = await axios.post(`https://graph.facebook.com/v26.0/${this.pageId}/photo_stories`, null, {
            params: {
              photo_id: photoId,
              access_token: this.pageAccessToken,
            },
          });
          return response.data.post_id || response.data.id;
        }, { label });
        storyIds.push(storyId);
      } catch (err) {
        const message = metaErrorMessage(err);
        errors.push(message);
        logger.warn(`${label} scartata dopo i tentativi: ${message}`);
      }
    }

    if (storyIds.length === 0) {
      const message = errors.join("; ");
      logger.error(`Errore nella pubblicazione delle Storie Facebook: ${message}`);
      return { success: false, error: message, platform: "facebook-story" };
    }

    logger.info(`Storie Facebook pubblicate: ${storyIds.length}/${photos.length}`);
    return { success: true, storyIds, platform: "facebook-story" };
  }

  // Instagram elabora l'immagine in modo asincrono dopo la creazione del container:
  // bisogna aspettare status_code === "FINISHED" prima di poter chiamare media_publish,
  // altrimenti fallisce con "Media ID is not available" (code=9007).
  async waitForMediaReady(creationId, maxAttempts = 10, delayMs = 2000) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const response = await axios.get(`https://graph.facebook.com/v26.0/${creationId}`, {
        params: {
          fields: "status_code",
          access_token: this.pageAccessToken,
        },
      });

      const statusCode = response.data.status_code;
      if (statusCode === "FINISHED") return;
      if (statusCode === "ERROR") {
        throw new Error("Elaborazione del media Instagram fallita (status ERROR)");
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error("Timeout in attesa che Instagram elaborasse il media");
  }

  // ATTENZIONE: a differenza di Facebook, Instagram non supporta le bozze via API.
  // Questo pubblica il post immediatamente e pubblicamente sul profilo Instagram.
  async publishToInstagram(text, imageBuffers) {
    if (!this.instagramAccountId || !this.pageAccessToken) {
      logger.warn("Meta API: instagramAccountId o token non disponibili");
      return { success: false, error: "Account Instagram non collegato" };
    }

    // Instagram supporta al massimo 10 foto per carosello.
    const photos = (Array.isArray(imageBuffers) ? imageBuffers : imageBuffers ? [imageBuffers] : [])
      .filter(Boolean)
      .slice(0, 10);

    if (photos.length === 0) {
      logger.warn("Instagram richiede almeno un'immagine per i post. Saltando...");
      return { success: false, error: "Immagine richiesta per Instagram" };
    }

    const caption = truncateInstagramCaption(text);

    try {
      let creationId;

      if (photos.length === 1) {
        const imageUrl = await this.getPublicImageUrl(photos[0]);
        const createResponse = await axios.post(`${GRAPH_API_URL}/${this.instagramAccountId}/media`, null, {
          params: {
            image_url: imageUrl,
            caption,
            access_token: this.pageAccessToken,
          },
        });
        creationId = createResponse.data.id;
        await this.waitForMediaReady(creationId);
      } else {
        // Carosello: un container per ogni foto (is_carousel_item, senza caption),
        // poi un container "genitore" (media_type=CAROUSEL) che le raggruppa con la caption.
        const itemIds = [];
        for (const buffer of photos) {
          const imageUrl = await this.getPublicImageUrl(buffer);
          const itemResponse = await axios.post(`${GRAPH_API_URL}/${this.instagramAccountId}/media`, null, {
            params: {
              image_url: imageUrl,
              is_carousel_item: true,
              access_token: this.pageAccessToken,
            },
          });
          await this.waitForMediaReady(itemResponse.data.id);
          itemIds.push(itemResponse.data.id);
        }

        const carouselResponse = await axios.post(`${GRAPH_API_URL}/${this.instagramAccountId}/media`, null, {
          params: {
            media_type: "CAROUSEL",
            children: itemIds.join(","),
            caption,
            access_token: this.pageAccessToken,
          },
        });
        creationId = carouselResponse.data.id;
        await this.waitForMediaReady(creationId);
      }

      logger.info(`Media Instagram creato (container): ${creationId} (${photos.length} foto)`);

      const publishResponse = await axios.post(
        `${GRAPH_API_URL}/${this.instagramAccountId}/media_publish`,
        null,
        {
          params: {
            creation_id: creationId,
            access_token: this.pageAccessToken,
          },
        }
      );

      logger.info(`Post Instagram pubblicato: ${publishResponse.data.id}`);

      // Non await-ato di proposito, stesso motivo di publishFacebookDraft.
      this.postInstagramShareCta(publishResponse.data.id);

      return { success: true, mediaId: publishResponse.data.id, platform: "instagram" };
    } catch (err) {
      const message = metaErrorMessage(err);
      logger.error(`Errore nella pubblicazione Instagram: ${message}`);
      return { success: false, error: message, platform: "instagram" };
    }
  }

  // Pubblica un Reel su Instagram. A differenza delle foto, l'API Instagram non
  // accetta l'upload diretto del binario video: serve un videoUrl pubblicamente
  // raggiungibile (a differenza di getPublicImageUrl per le foto, qui il video va
  // ospitato altrove PRIMA di chiamare questa funzione — vedi runGenerate in
  // telegramBot.js, che lo carica sulla libreria media di WordPress per ottenere
  // un URL pubblico stabile). Il video pubblica subito, come i post Instagram
  // normali: non esiste un concetto di bozza via API.
  async publishInstagramReel(caption, videoUrl) {
    if (!this.instagramAccountId || !this.pageAccessToken) {
      logger.warn("Meta API: instagramAccountId o token non disponibili");
      return { success: false, error: "Account Instagram non collegato" };
    }

    try {
      const createResponse = await axios.post(`${GRAPH_API_URL}/${this.instagramAccountId}/media`, null, {
        params: {
          media_type: "REELS",
          video_url: videoUrl,
          caption: truncateInstagramCaption(caption),
          access_token: this.pageAccessToken,
        },
      });
      const creationId = createResponse.data.id;

      // L'elaborazione di un video richiede più tempo di una foto: fino a 90s
      // invece dei 20s di default (waitForMediaReady, maxAttempts x delayMs).
      await this.waitForMediaReady(creationId, 30, 3000);

      logger.info(`Media Reel Instagram creato (container): ${creationId}`);

      const publishResponse = await axios.post(
        `${GRAPH_API_URL}/${this.instagramAccountId}/media_publish`,
        null,
        {
          params: {
            creation_id: creationId,
            access_token: this.pageAccessToken,
          },
        }
      );

      logger.info(`Reel Instagram pubblicato: ${publishResponse.data.id}`);

      // Non await-ato di proposito, stesso motivo di publishFacebookDraft.
      this.postInstagramShareCta(publishResponse.data.id);

      return { success: true, mediaId: publishResponse.data.id, platform: "instagram-reel" };
    } catch (err) {
      const message = metaErrorMessage(err);
      logger.error(`Errore nella pubblicazione del Reel Instagram: ${message}`);
      return { success: false, error: message, platform: "instagram-reel" };
    }
  }

  // Pubblica una o più Storie Instagram (contenuto effimero, sparisce dopo 24h), in
  // aggiunta al post/carosello normale. Una Storia mostra sempre una sola foto: con
  // più foto ne pubblica una in sequenza per ciascuna. Va online subito, come il post.
  async publishInstagramStory(imageBuffers) {
    if (!this.instagramAccountId || !this.pageAccessToken) {
      logger.warn("Meta API: instagramAccountId o token non disponibili");
      return { success: false, error: "Account Instagram non collegato" };
    }

    const photos = (Array.isArray(imageBuffers) ? imageBuffers : imageBuffers ? [imageBuffers] : [])
      .filter(Boolean)
      .slice(0, MAX_STORY_SLIDES);

    if (photos.length === 0) {
      return { success: false, error: "Immagine richiesta per la Storia Instagram" };
    }

    const storyIds = [];
    const errors = [];

    for (const [index, buffer] of photos.entries()) {
      const label = `Storia Instagram slide ${index + 1}/${photos.length}`;
      try {
        const storyId = await withRetry(async () => {
          const imageUrl = await this.getPublicImageUrl(buffer);

          const createResponse = await axios.post(`${GRAPH_API_URL}/${this.instagramAccountId}/media`, null, {
            params: {
              image_url: imageUrl,
              media_type: "STORIES",
              access_token: this.pageAccessToken,
            },
          });

          const creationId = createResponse.data.id;
          await this.waitForMediaReady(creationId);

          const publishResponse = await axios.post(
            `${GRAPH_API_URL}/${this.instagramAccountId}/media_publish`,
            null,
            {
              params: {
                creation_id: creationId,
                access_token: this.pageAccessToken,
              },
            }
          );

          return publishResponse.data.id;
        }, { label });
        storyIds.push(storyId);
      } catch (err) {
        const message = metaErrorMessage(err);
        errors.push(message);
        logger.warn(`${label} scartata dopo i tentativi: ${message}`);
      }
    }

    if (storyIds.length === 0) {
      const message = errors.join("; ");
      logger.error(`Errore nella pubblicazione delle Storie Instagram: ${message}`);
      return { success: false, error: message, platform: "instagram-story" };
    }

    logger.info(`Storie Instagram pubblicate: ${storyIds.length}/${photos.length}`);
    return { success: true, storyIds, platform: "instagram-story" };
  }

  // Risponde pubblicamente a un commento di un post Facebook (non un DM privato):
  // usata dal webhook per il ringraziamento automatico a chi scrive la parola
  // chiave di condivisione nei commenti.
  async replyToFacebookComment(commentId, message) {
    const response = await axios.post(`${GRAPH_API_URL}/${commentId}/comments`, null, {
      params: { message, access_token: this.pageAccessToken },
    });
    return response.data.id;
  }

  // Equivalente per un commento su un post/media Instagram: endpoint diverso
  // (/replies invece di /comments), stesso Page Access Token perché l'account
  // IG è collegato alla stessa Pagina.
  async replyToInstagramComment(commentId, message) {
    const response = await axios.post(`${GRAPH_API_URL}/${commentId}/replies`, null, {
      params: { message, access_token: this.pageAccessToken },
    });
    return response.data.id;
  }

  // Pubblica un commento di primo livello sul post/media stesso (non una risposta
  // a un commento esistente): usata per il commento automatico "Condividi e
  // scrivici CONDIVISO" che il bot posta come Pagina subito dopo ogni
  // pubblicazione. Fallisce silenziosamente (solo un warning) perché non deve mai
  // far fallire la pubblicazione del post/media in sé, solo aggiuntivo.
  async postFacebookShareCta(postId) {
    try {
      await axios.post(`${GRAPH_API_URL}/${postId}/comments`, null, {
        params: { message: SHARE_CTA_COMMENT, access_token: this.pageAccessToken },
      });
      logger.debug(`Commento CTA condivisione pubblicato sul post Facebook ${postId}`);
    } catch (err) {
      logger.warn(`Impossibile pubblicare il commento CTA condivisione su Facebook: ${metaErrorMessage(err)}`);
    }
  }

  // Equivalente Instagram: endpoint /comments sul media (non /replies, che è solo
  // per rispondere a un commento esistente).
  async postInstagramShareCta(mediaId) {
    try {
      await axios.post(`${GRAPH_API_URL}/${mediaId}/comments`, null, {
        params: { message: SHARE_CTA_COMMENT, access_token: this.pageAccessToken },
      });
      logger.debug(`Commento CTA condivisione pubblicato sul media Instagram ${mediaId}`);
    } catch (err) {
      logger.warn(`Impossibile pubblicare il commento CTA condivisione su Instagram: ${metaErrorMessage(err)}`);
    }
  }

  async publishToMetaBusiness(facebookText, instagramText, photos, optimizedPhotos = null) {
    logger.info(`Pubblicazione su Meta Business Suite (bozze). Facebook: "${facebookText.slice(0, 50)}..."`);

    const results = {
      facebook: null,
      instagram: null,
      facebookStory: null,
      instagramStory: null,
      errors: [],
    };

    // Usa foto ottimizzate se disponibili, altrimenti usa tutte le foto originali
    const facebookPhotos = optimizedPhotos?.facebook
      ? (Array.isArray(optimizedPhotos.facebook) ? optimizedPhotos.facebook : [optimizedPhotos.facebook])
      : photos.map((p) => p.buffer);
    const instagramPhotos = optimizedPhotos?.instagram
      ? (Array.isArray(optimizedPhotos.instagram) ? optimizedPhotos.instagram : [optimizedPhotos.instagram])
      : photos.map((p) => p.buffer);
    // Le Storie usano un ritaglio verticale 9:16 dedicato (vedi photoOptimizer.js),
    // diverso da quello usato per i post: non riciclare facebookPhotos/instagramPhotos.
    const storyPhotos = optimizedPhotos?.story
      ? (Array.isArray(optimizedPhotos.story) ? optimizedPhotos.story : [optimizedPhotos.story])
      : instagramPhotos.length > 0
        ? instagramPhotos
        : facebookPhotos;

    try {
      const fbResult = await this.publishToFacebook(facebookText, facebookPhotos);
      results.facebook = fbResult;
      if (!fbResult.success) {
        results.errors.push(`Facebook: ${fbResult.error}`);
      }
    } catch (err) {
      results.errors.push(`Facebook error: ${err.message}`);
    }

    try {
      const igResult = await this.publishToInstagram(instagramText, instagramPhotos);
      results.instagram = igResult;
      if (!igResult.success) {
        results.errors.push(`Instagram: ${igResult.error}`);
      }
    } catch (err) {
      results.errors.push(`Instagram error: ${err.message}`);
    }

    try {
      const fbStoryResult = await this.publishFacebookStory(storyPhotos);
      results.facebookStory = fbStoryResult;
      if (!fbStoryResult.success) {
        results.errors.push(`Storia Facebook: ${fbStoryResult.error}`);
      }
    } catch (err) {
      results.errors.push(`Storia Facebook error: ${err.message}`);
    }

    try {
      const igStoryResult = await this.publishInstagramStory(storyPhotos);
      results.instagramStory = igStoryResult;
      if (!igStoryResult.success) {
        results.errors.push(`Storia Instagram: ${igStoryResult.error}`);
      }
    } catch (err) {
      results.errors.push(`Storia Instagram error: ${err.message}`);
    }

    logger.info(`Pubblicazione Meta completata. Risultati: ${JSON.stringify(results)}`);
    return results;
  }
}

export async function initMetaAPI() {
  const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;
  const pageId = process.env.META_PAGE_ID;

  if (!pageAccessToken || !pageId) {
    logger.warn("Meta API non configurata (mancano credenziali in .env)");
    return null;
  }

  const metaAPI = new MetaAPI(pageAccessToken, pageId);
  await metaAPI.initialize();
  return metaAPI;
}
