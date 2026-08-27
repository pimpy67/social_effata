import axios from "axios";
import { logger } from "./logger.js";

// Scope per pubblicare a nome della pagina aziendale (Community Management API).
// Solo `w_organization_social` è indispensabile per POST /rest/posts; gli altri
// (letture, admin) davano "invalid_scope_error" se non abilitati per l'app al
// Development Tier. Override possibile via env LINKEDIN_SCOPE se in futuro servono
// più permessi (es. leggere le statistiche dei post).
const LINKEDIN_SCOPE = process.env.LINKEDIN_SCOPE || "w_organization_social";

// Versione dell'header LinkedIn-Version (formato AAAAMM), mostrata nella scheda
// "Products > Community Management API endpoints" del portale sviluppatori.
// LinkedIn accetta versioni non più vecchie di ~12 mesi: se le chiamate iniziano
// a rispondere 426 "Upgrade Required", alzare questo valore.
const LINKEDIN_API_VERSION = "202505";
const LINKEDIN_REST = "https://api.linkedin.com/rest";

// Il campo "commentary" della Posts API usa un mini-formato proprietario in cui
// alcuni caratteri sono speciali e vanno preceduti da backslash, altrimenti la
// richiesta fallisce (422) o il testo esce storto. Sul rendering il backslash
// sparisce. NON tocchiamo '#' per non rompere gli hashtag.
export function escapeLinkedInCommentary(text) {
  return String(text ?? "").replace(/[\\@()\[\]{}<>|~]/g, "\\$&");
}

function linkedinHeaders(accessToken, extra = {}) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "X-Restli-Protocol-Version": "2.0.0",
    "LinkedIn-Version": LINKEDIN_API_VERSION,
    ...extra,
  };
}

// Estrae il messaggio d'errore reale di LinkedIn invece del generico axios.
function linkedinErrorMessage(err) {
  const data = err.response?.data;
  if (!data) return err.message;
  return data.message || data.error_description || JSON.stringify(data);
}

export function getLinkedInAuthUrl() {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error("LINKEDIN_CLIENT_ID o LINKEDIN_REDIRECT_URI mancanti nel .env");
  }

  const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", LINKEDIN_SCOPE);

  return url.toString();
}

// Scambia il codice di autorizzazione ricevuto da LinkedIn con un vero access token.
export async function exchangeLinkedInCode(code) {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Credenziali LinkedIn mancanti nel .env");
  }

  const response = await axios.post(
    "https://www.linkedin.com/oauth/v2/accessToken",
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  logger.info("Token LinkedIn ottenuto con successo");
  return response.data; // { access_token, expires_in, scope }
}

export class LinkedInAPI {
  constructor(accessToken, orgId) {
    this.accessToken = accessToken;
    // Accetta sia l'ID numerico ("123213982") sia l'URN completo.
    this.orgUrn = String(orgId).startsWith("urn:li:")
      ? String(orgId)
      : `urn:li:organization:${orgId}`;
  }

  // Carica un'immagine nella libreria di LinkedIn e ne restituisce l'URN, da
  // allegare al post. Flusso in 2 passi: initializeUpload → PUT del binario.
  async uploadImage(imageBuffer) {
    const initResponse = await axios.post(
      `${LINKEDIN_REST}/images?action=initializeUpload`,
      { initializeUploadRequest: { owner: this.orgUrn } },
      { headers: linkedinHeaders(this.accessToken, { "Content-Type": "application/json" }) }
    );

    const { uploadUrl, image } = initResponse.data.value;
    await axios.put(uploadUrl, imageBuffer, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });

    return image; // urn:li:image:...
  }

  // Pubblica un post sulla pagina aziendale. Se imageBuffer è fornito prova ad
  // allegare l'immagine, ma se l'upload fallisce ripiega su un post di solo testo
  // invece di perdere la pubblicazione.
  async publishPost(text, imageBuffer = null) {
    if (!this.accessToken || !this.orgUrn) {
      return { success: false, error: "Credenziali LinkedIn mancanti" };
    }

    let imageUrn = null;
    if (imageBuffer) {
      try {
        imageUrn = await this.uploadImage(imageBuffer);
      } catch (err) {
        logger.warn(`Upload immagine LinkedIn fallito, procedo col solo testo: ${linkedinErrorMessage(err)}`);
      }
    }

    const body = {
      author: this.orgUrn,
      commentary: escapeLinkedInCommentary(text),
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    };

    if (imageUrn) {
      body.content = { media: { id: imageUrn } };
    }

    try {
      const response = await axios.post(`${LINKEDIN_REST}/posts`, body, {
        headers: linkedinHeaders(this.accessToken, { "Content-Type": "application/json" }),
      });
      const postUrn = response.headers["x-restli-id"] || response.headers["x-linkedin-id"] || null;
      logger.info(`Post LinkedIn pubblicato: ${postUrn || "(URN non restituito)"}`);
      return { success: true, postUrn, withImage: !!imageUrn };
    } catch (err) {
      const message = linkedinErrorMessage(err);
      logger.error(`Errore nella pubblicazione LinkedIn: ${message}`);
      return { success: false, error: message };
    }
  }
}

export async function initLinkedInAPI() {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const orgId = process.env.LINKEDIN_ORG_ID;

  if (!accessToken || !orgId) {
    logger.warn("LinkedIn API non configurata (mancano LINKEDIN_ACCESS_TOKEN/LINKEDIN_ORG_ID nel .env)");
    return null;
  }

  logger.info("LinkedIn API inizializzata");
  return new LinkedInAPI(accessToken, orgId);
}
