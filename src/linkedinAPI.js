import axios from "axios";
import { logger } from "./logger.js";

// Scope necessari per pubblicare a nome della pagina aziendale (Community Management API).
const LINKEDIN_SCOPE = "w_organization_social r_organization_social rw_organization_admin";

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
