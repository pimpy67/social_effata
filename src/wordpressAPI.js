import axios from "axios";
import { logger } from "./logger.js";

// Converte il testo generato (paragrafi separati da righe vuote) in HTML semplice,
// cosi' l'articolo si formatta bene indipendentemente dal tema WordPress usato.
function formatBlogContentHtml(text) {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join("\n");
}

export class WordPressAPI {
  constructor(siteUrl, username, appPassword) {
    this.siteUrl = siteUrl.replace(/\/$/, "");
    this.client = axios.create({
      baseURL: `${this.siteUrl}/wp-json/wp/v2`,
      auth: { username, password: appPassword },
    });
  }

  // Crea l'articolo come bozza: resta invisibile al pubblico finché non lo
  // pubblica qualcuno da wp-admin.
  async createDraftPost(title, bodyText) {
    try {
      const response = await this.client.post("/posts", {
        title,
        content: formatBlogContentHtml(bodyText),
        status: "draft",
      });

      const editLink = `${this.siteUrl}/wp-admin/post.php?post=${response.data.id}&action=edit`;
      logger.info(`Bozza WordPress creata: id=${response.data.id}`);
      return { success: true, postId: response.data.id, editLink };
    } catch (err) {
      const message = err.response?.data?.message || err.message;
      logger.error(`Errore nel creare la bozza WordPress: ${message}`);
      return { success: false, error: message };
    }
  }
}

export async function initWordPressAPI() {
  const siteUrl = process.env.WORDPRESS_URL;
  const username = process.env.WORDPRESS_USERNAME;
  const appPassword = process.env.WORDPRESS_APP_PASSWORD;

  if (!siteUrl || !username || !appPassword) {
    logger.warn("WordPress API non configurata (mancano credenziali in .env)");
    return null;
  }

  logger.info("WordPress API inizializzata");
  return new WordPressAPI(siteUrl, username, appPassword);
}
