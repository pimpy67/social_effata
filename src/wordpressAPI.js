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

// Genera lo stesso markup a blocco Gutenberg (wp:gallery + wp:image annidati) usato
// negli altri articoli del blog, invece dello shortcode [gallery] che il tema
// renderizza con thumbnail piccole anziché nella galleria grande "a flex".
export function buildGalleryBlock(mediaItems) {
  if (mediaItems.length === 0) return "";

  const images = mediaItems
    .map(
      ({ id, url }) =>
        `<!-- wp:image {"id":${id},"sizeSlug":"large","linkDestination":"none"} -->\n<figure class="wp-block-image size-large"><img src="${url}" alt="" class="wp-image-${id}"/></figure>\n<!-- /wp:image -->`
    )
    .join("\n\n");

  return `<!-- wp:gallery {"linkTo":"none"} -->\n<figure class="wp-block-gallery has-nested-images columns-default is-cropped is-layout-flex wp-block-gallery-is-layout-flex">\n${images}\n</figure>\n<!-- /wp:gallery -->`;
}

const DEFAULT_CTA_LABEL = "SOSTIENI IL PROGETTO";

// Genera il blocco Gutenberg per il bottone di invito all'azione (bottone pieno +
// spaziatore), nello stesso stile usato negli articoli pubblicati manualmente
// (es. "SOSTIENI LA CASA FAMIGLIA" che rimanda al calendario delle adozioni).
export function buildCtaButtonBlock(url, label = DEFAULT_CTA_LABEL) {
  const trimmed = (url || "").trim();
  if (!trimmed) return "";

  // I volontari spesso incollano il link senza "https://": senza uno schema
  // l'href verrebbe interpretato come link relativo al sito, quindi rotto.
  const href = (/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).replace(/"/g, "&quot;");

  return `<!-- wp:buttons -->\n<div class="wp-block-buttons"><!-- wp:button -->\n<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" href="${href}">${label}</a></div>\n<!-- /wp:button --></div>\n<!-- /wp:buttons -->\n\n<!-- wp:spacer {"height":"25px"} -->\n<div style="height:25px" aria-hidden="true" class="wp-block-spacer"></div>\n<!-- /wp:spacer -->`;
}

export class WordPressAPI {
  constructor(siteUrl, username, appPassword) {
    this.siteUrl = siteUrl.replace(/\/$/, "");
    this.client = axios.create({
      baseURL: `${this.siteUrl}/wp-json/wp/v2`,
      auth: { username, password: appPassword },
    });
  }

  // Carica una foto nella libreria media di WordPress. Ritorna l'id da usare come
  // immagine in evidenza o dentro una galleria.
  async uploadMedia(buffer, filename, mimeType) {
    const formData = new FormData();
    const blob = new Blob([buffer], { type: mimeType || "image/jpeg" });
    formData.append("file", blob, filename);

    const response = await this.client.post("/media", formData);
    return { id: response.data.id, url: response.data.source_url };
  }

  // Crea l'articolo come bozza: resta invisibile al pubblico finché non lo
  // pubblica qualcuno da wp-admin. Se vengono passate delle foto, la prima
  // caricata diventa l'immagine in evidenza (modificabile dopo in wp-admin) e
  // tutte insieme vengono inserite come galleria nel corpo dell'articolo.
  async createDraftPost(title, bodyText, images = [], ctaLink = null) {
    try {
      const media = [];
      for (const [i, img] of images.entries()) {
        try {
          const uploaded = await this.uploadMedia(img.buffer, `storia-${Date.now()}-${i + 1}.jpg`, img.mediaType);
          media.push(uploaded);
        } catch (err) {
          logger.warn(`Errore nel caricare una foto su WordPress: ${err.response?.data?.message || err.message}`);
        }
      }

      let content = formatBlogContentHtml(bodyText);
      const ctaBlock = buildCtaButtonBlock(ctaLink);
      if (ctaBlock) {
        content += `\n\n${ctaBlock}`;
      }
      if (media.length > 0) {
        content += `\n\n${buildGalleryBlock(media)}`;
      }

      const postData = { title, content, status: "draft" };
      if (media.length > 0) {
        postData.featured_media = media[0].id;
      }

      const response = await this.client.post("/posts", postData);

      const editLink = `${this.siteUrl}/wp-admin/post.php?post=${response.data.id}&action=edit`;
      logger.info(`Bozza WordPress creata: id=${response.data.id} (${media.length} foto)`);
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
