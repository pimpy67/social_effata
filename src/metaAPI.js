import axios from "axios";
import { logger } from "./logger.js";

const GRAPH_API_VERSION = "v26.0";
const GRAPH_API_URL = `https://graph.instagram.com/${GRAPH_API_VERSION}`;

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
      logger.warn(`Errore nell'inizializzazione MetaAPI: ${err.message}`);
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
        logger.debug(`Variante 1 (instagram_business_account) fallita: ${err1.message}`);
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
        logger.debug(`Variante 2 (instagram_business_accounts) fallita: ${err2.message}`);
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
        logger.debug(`Variante 3 (/instagram_accounts) fallita: ${err3.message}`);
      }

      logger.warn("Instagram Business Account non trovato - tutte le varianti fallite");
    } catch (err) {
      logger.error(`Errore nel recupero Instagram Account ID: ${err.message}`);
    }
  }

  async publishToFacebook(text, imageBuffer) {
    if (!this.pageAccessToken || !this.pageId) {
      logger.warn("Meta API: pageAccessToken o pageId non configurati");
      return { success: false, error: "Credenziali Meta mancanti" };
    }

    try {
      const formData = new FormData();
      formData.append("message", text);

      if (imageBuffer) {
        const blob = new Blob([imageBuffer], { type: "image/jpeg" });
        formData.append("source", blob, "image.jpg");
      }

      formData.append("published", "false"); // Pubblica come bozza

      const response = await axios.post(
        `https://graph.facebook.com/v26.0/${this.pageId}/feed`,
        formData,
        {
          params: {
            access_token: this.pageAccessToken,
          },
        }
      );

      logger.info(`Post Facebook pubblicato (bozza): ${response.data.id}`);
      return { success: true, postId: response.data.id, platform: "facebook" };
    } catch (err) {
      logger.error(`Errore nella pubblicazione Facebook: ${err.message}`);
      return { success: false, error: err.message, platform: "facebook" };
    }
  }

  async publishToInstagram(text, imageBuffer) {
    if (!this.instagramAccountId || !this.pageAccessToken) {
      logger.warn("Meta API: instagramAccountId o token non disponibili");
      return { success: false, error: "Account Instagram non collegato" };
    }

    try {
      if (!imageBuffer) {
        logger.warn("Instgram richiede un'immagine per i post. Saltando...");
        return { success: false, error: "Immagine richiesta per Instagram" };
      }

      const formData = new FormData();
      const blob = new Blob([imageBuffer], { type: "image/jpeg" });
      formData.append("image_url", blob);
      formData.append("caption", text);
      formData.append("access_token", this.pageAccessToken);

      const response = await axios.post(
        `${GRAPH_API_URL}/${this.instagramAccountId}/media`,
        formData
      );

      logger.info(`Media Instagram creato (draft): ${response.data.id}`);

      return { success: true, mediaId: response.data.id, platform: "instagram" };
    } catch (err) {
      logger.error(`Errore nella pubblicazione Instagram: ${err.message}`);
      return { success: false, error: err.message, platform: "instagram" };
    }
  }

  async publishToMetaBusiness(facebookText, instagramText, photos, optimizedPhotos = null) {
    logger.info(`Pubblicazione su Meta Business Suite (bozze). Facebook: "${facebookText.slice(0, 50)}..."`);

    const results = {
      facebook: null,
      instagram: null,
      errors: [],
    };

    // Usa foto ottimizzate se disponibili, altrimenti usa la prima foto originale
    const facebookPhoto = optimizedPhotos?.facebook || (photos.length > 0 ? photos[0].buffer : null);
    const instagramPhoto = optimizedPhotos?.instagram || (photos.length > 0 ? photos[0].buffer : null);

    try {
      const fbResult = await this.publishToFacebook(facebookText, facebookPhoto);
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
