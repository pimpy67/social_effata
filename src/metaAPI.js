import axios from "axios";
import { logger } from "./logger.js";

const GRAPH_API_VERSION = "v26.0";
const GRAPH_API_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Instagram rifiuta (code=36004) qualsiasi caption oltre 2200 caratteri, sia per
// post singoli che per caroselli: a differenza di Telegram non è possibile pubblicare
// la foto senza didascalia e mandare il testo completo a parte, quindi qui troncamo
// per non perdere la pubblicazione.
const INSTAGRAM_CAPTION_LIMIT = 2200;

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
      .slice(0, 10);

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

      return { success: true, mediaId: publishResponse.data.id, platform: "instagram" };
    } catch (err) {
      const message = metaErrorMessage(err);
      logger.error(`Errore nella pubblicazione Instagram: ${message}`);
      return { success: false, error: message, platform: "instagram" };
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
      .slice(0, 10);

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
