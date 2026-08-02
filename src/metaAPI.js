import axios from "axios";
import { logger } from "./logger.js";

const GRAPH_API_VERSION = "v26.0";
const GRAPH_API_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Estrae il messaggio d'errore reale restituito da Meta (es. token scaduto,
// permesso mancante) invece del generico "Request failed with status code 4xx"
// che axios mette in err.message.
function metaErrorMessage(err) {
  const metaError = err.response?.data?.error;
  return metaError ? `${metaError.message} (code=${metaError.code}, subcode=${metaError.error_subcode ?? "-"})` : err.message;
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

  // ATTENZIONE: a differenza di Facebook, Instagram non supporta le bozze via API.
  // Questo pubblica il post immediatamente e pubblicamente sul profilo Instagram.
  async publishToInstagram(text, imageBuffer) {
    if (!this.instagramAccountId || !this.pageAccessToken) {
      logger.warn("Meta API: instagramAccountId o token non disponibili");
      return { success: false, error: "Account Instagram non collegato" };
    }

    try {
      if (!imageBuffer) {
        logger.warn("Instagram richiede un'immagine per i post. Saltando...");
        return { success: false, error: "Immagine richiesta per Instagram" };
      }

      const imageUrl = await this.getPublicImageUrl(imageBuffer);

      const createResponse = await axios.post(`${GRAPH_API_URL}/${this.instagramAccountId}/media`, null, {
        params: {
          image_url: imageUrl,
          caption: text,
          access_token: this.pageAccessToken,
        },
      });

      const creationId = createResponse.data.id;
      logger.info(`Media Instagram creato (container): ${creationId}`);

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

  async publishToMetaBusiness(facebookText, instagramText, photos, optimizedPhotos = null) {
    logger.info(`Pubblicazione su Meta Business Suite (bozze). Facebook: "${facebookText.slice(0, 50)}..."`);

    const results = {
      facebook: null,
      instagram: null,
      errors: [],
    };

    // Usa foto ottimizzate se disponibili, altrimenti usa tutte le foto originali
    const facebookPhotos = optimizedPhotos?.facebook
      ? (Array.isArray(optimizedPhotos.facebook) ? optimizedPhotos.facebook : [optimizedPhotos.facebook])
      : photos.map((p) => p.buffer);
    const instagramPhoto = optimizedPhotos?.instagram || (photos.length > 0 ? photos[0].buffer : null);

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
      const igResult = await this.publishToInstagram(instagramText, instagramPhoto);
      results.instagram = igResult;
      if (!igResult.success) {
        results.errors.push(`Instagram: ${igResult.error}`);
      }
    } catch (err) {
      results.errors.push(`Instagram error: ${err.message}`);
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
