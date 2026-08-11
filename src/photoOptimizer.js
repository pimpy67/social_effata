import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.join(__dirname, "..", "assets", "effata-logo.jpg");
// Colori campionati dal logo Effatà (assets/effata-logo.jpg): sfondo rosso e scritta gialla.
const BRAND_RED = "#c22e20";

// Dimensioni massime per ogni social (width x height in px). Usate come limite,
// non come rapporto forzato: la foto viene rimpicciolita se serve ma non
// ritagliata, per non tagliare mai volti o dettagli importanti.
// Facebook/Instagram/LinkedIn usano un box 4:5 (invece di un quadrato) perché è il
// formato che occupa più schermo nel feed mobile: essendo "fit: inside" una foto
// orizzontale non ne risente (resta comunque limitata dalla larghezza), mentre una
// foto verticale/quadrata sfrutta il box più alto.
const SOCIAL_DIMENSIONS = {
  facebook: { width: 1080, height: 1350 },
  instagram: { width: 1080, height: 1350 },
  linkedin: { width: 1080, height: 1350 },
  blog: { width: 1000, height: 1000 },
  reel: { width: 1200, height: 1200 },
};

// Storie (Facebook e Instagram) occupano sempre l'intero schermo verticale 9:16.
const STORY_DIMENSIONS = { width: 1080, height: 1920 };

// Sotto questa soglia il crop "cover" taglierebbe via più del 25% del lato lungo
// della foto (es. una foto molto panoramica forzata in verticale): in quel caso si
// passa al fallback blur-pad, che non taglia nulla, invece di rischiare di tagliare
// volti o dettagli fuori dall'area di attenzione rilevata.
const STORY_CROP_MIN_KEPT_FRACTION = 0.75;

// Ritaglia una foto per le Storie usando il crop "attention" di sharp, che centra il
// ritaglio sull'area a maggior dettaglio/contrasto (spesso il soggetto/volto) invece
// del centro geometrico. Se la foto è troppo lontana dal 9:16 e il crop taglierebbe
// troppo, ripiega su uno sfondo sfocato con la foto intera sovrapposta al centro
// (nessun taglio, nessuna banda vuota).
async function buildStoryImage(buffer) {
  const targetRatio = STORY_DIMENSIONS.width / STORY_DIMENSIONS.height;
  const metadata = await sharp(buffer).metadata();
  const sourceRatio = metadata.width / metadata.height;
  const keptFraction =
    sourceRatio > targetRatio
      ? targetRatio / sourceRatio
      : sourceRatio / targetRatio;

  if (keptFraction >= STORY_CROP_MIN_KEPT_FRACTION) {
    return sharp(buffer)
      .resize(STORY_DIMENSIONS.width, STORY_DIMENSIONS.height, {
        fit: "cover",
        position: sharp.strategy.attention,
      })
      .jpeg({ quality: 90, progressive: true })
      .toBuffer();
  }

  const background = await sharp(buffer)
    .resize(STORY_DIMENSIONS.width, STORY_DIMENSIONS.height, { fit: "cover" })
    .blur(30)
    .toBuffer();

  const foreground = await sharp(buffer)
    .resize(STORY_DIMENSIONS.width, STORY_DIMENSIONS.height, { fit: "inside" })
    .toBuffer();

  return sharp(background)
    .composite([{ input: foreground, gravity: "center" }])
    .jpeg({ quality: 90, progressive: true })
    .toBuffer();
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Spezza un testo in righe che stanno all'incirca in maxCharsPerLine caratteri,
// senza spezzare le parole (approssimazione a caratteri, non a larghezza reale del
// font: sufficiente per frasi brevi come quelle usate nelle Storie).
function wrapText(text, maxCharsPerLine) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const SUBTITLE_FONT_SIZE = 56;
const SUBTITLE_MAX_CHARS_PER_LINE = 22;
const SUBTITLE_LINE_HEIGHT = 68;
// Margine dal bordo inferiore per restare fuori dalla "safe area" coperta
// dall'interfaccia di Instagram/Facebook (barra di risposta in basso).
const SUBTITLE_BOTTOM_MARGIN = 220;

// Scrive una frase corta in basso su una foto Storia già ritagliata a 1080x1920,
// con una fascia semi-trasparente dietro per restare leggibile su qualsiasi sfondo.
async function addStorySubtitle(buffer, text) {
  if (!text || !text.trim()) return buffer;

  const lines = wrapText(text.trim(), SUBTITLE_MAX_CHARS_PER_LINE).slice(0, 4);
  const bandHeight = 80 + lines.length * SUBTITLE_LINE_HEIGHT;
  const bandY = STORY_DIMENSIONS.height - bandHeight - SUBTITLE_BOTTOM_MARGIN;

  const textSvg = lines
    .map(
      (line, i) =>
        `<text x="50%" y="${bandY + 70 + i * SUBTITLE_LINE_HEIGHT}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-weight="bold" font-size="${SUBTITLE_FONT_SIZE}" fill="#ffffff">${escapeXml(line)}</text>`
    )
    .join("");

  const svg = `<svg width="${STORY_DIMENSIONS.width}" height="${STORY_DIMENSIONS.height}">
      <rect x="0" y="${bandY}" width="${STORY_DIMENSIONS.width}" height="${bandHeight}" fill="rgba(0,0,0,0.55)" />
      ${textSvg}
    </svg>`;

  return sharp(buffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 90, progressive: true })
    .toBuffer();
}

const INFO_SLIDE_LOGO_SIZE = 260;
const INFO_SLIDE_FONT_SIZE = 50;
const INFO_SLIDE_MAX_CHARS_PER_LINE = 24;
const INFO_SLIDE_LINE_HEIGHT = 66;

// Slide fissa di chiusura per le Storie: sfondo a tinta unita col rosso del logo
// Effatà, logo centrato, testo fisso (diverso per categoria, vedi CATEGORY_STORY_INFO
// in telegramBot.js) sotto il logo. Non contiene nessuna foto del volontario.
async function buildCategoryInfoSlide(text) {
  const logoBuffer = await sharp(LOGO_PATH)
    .resize(INFO_SLIDE_LOGO_SIZE, INFO_SLIDE_LOGO_SIZE, { fit: "cover" })
    .toBuffer();

  const lines = wrapText(text.trim(), INFO_SLIDE_MAX_CHARS_PER_LINE);
  const logoTop = Math.round(STORY_DIMENSIONS.height / 2 - INFO_SLIDE_LOGO_SIZE / 2 - 140);
  const textStartY = logoTop + INFO_SLIDE_LOGO_SIZE + 110;

  const textSvg = lines
    .map(
      (line, i) =>
        `<text x="50%" y="${textStartY + i * INFO_SLIDE_LINE_HEIGHT}" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-weight="bold" font-size="${INFO_SLIDE_FONT_SIZE}" fill="#ffffff">${escapeXml(line)}</text>`
    )
    .join("");

  const background = `<svg width="${STORY_DIMENSIONS.width}" height="${STORY_DIMENSIONS.height}">
      <rect width="100%" height="100%" fill="${BRAND_RED}" />
    </svg>`;
  const textOverlay = `<svg width="${STORY_DIMENSIONS.width}" height="${STORY_DIMENSIONS.height}">${textSvg}</svg>`;

  return sharp(Buffer.from(background))
    .composite([
      {
        input: logoBuffer,
        left: Math.round((STORY_DIMENSIONS.width - INFO_SLIDE_LOGO_SIZE) / 2),
        top: logoTop,
      },
      { input: Buffer.from(textOverlay), top: 0, left: 0 },
    ])
    .jpeg({ quality: 90, progressive: true })
    .toBuffer();
}

export async function optimizePhotosForSocial(imageBuffers, { storySlideTexts = [], categoryInfoText = null } = {}) {
  try {
    const optimized = {};

    try {
      const cropped = await Promise.all(
        imageBuffers.map((img) => buildStoryImage(img.buffer))
      );
      optimized.story = await Promise.all(
        cropped.map((buf, i) => addStorySubtitle(buf, storySlideTexts[i]))
      );
      logger.debug(`${imageBuffers.length} foto elaborate per le Storie (${STORY_DIMENSIONS.width}x${STORY_DIMENSIONS.height}, crop attention o blur-pad se troppo panoramiche)`);

      if (categoryInfoText && categoryInfoText.trim()) {
        optimized.story.push(await buildCategoryInfoSlide(categoryInfoText));
        logger.debug("Slide fissa 'info di categoria' aggiunta in fondo alle Storie");
      }
    } catch (err) {
      logger.warn(`Errore nel ritagliare foto per le Storie: ${err.message}`);
      optimized.story = imageBuffers.map((img) => img.buffer);
    }

    // Crea versioni ottimizzate per ogni social
    for (const [social, dimensions] of Object.entries(SOCIAL_DIMENSIONS)) {
      try {
        if (social === "facebook" || social === "instagram") {
          // Facebook e Instagram supportano più foto per post (album/carosello):
          // ottimizza tutte quelle caricate.
          optimized[social] = await Promise.all(
            imageBuffers.map((img) =>
              sharp(img.buffer)
                .resize(dimensions.width, dimensions.height, {
                  fit: "inside",
                  withoutEnlargement: true,
                })
                .jpeg({ quality: 90, progressive: true })
                .toBuffer()
            )
          );
          logger.debug(`${imageBuffers.length} foto ottimizzate per ${social} (max ${dimensions.width}x${dimensions.height}, senza ritaglio)`);
          continue;
        }

        // Gli altri social usano un solo post/immagine: la prima foto
        const buffer = imageBuffers[0].buffer;

        optimized[social] = await sharp(buffer)
          .resize(dimensions.width, dimensions.height, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: 90, progressive: true })
          .toBuffer();

        logger.debug(`Foto ottimizzata per ${social} (max ${dimensions.width}x${dimensions.height}, senza ritaglio)`);
      } catch (err) {
        logger.warn(`Errore nell'ottimizzare foto per ${social}: ${err.message}`);
        // Fallback: usa la foto originale se l'ottimizzazione fallisce
        optimized[social] =
          social === "facebook" || social === "instagram"
            ? imageBuffers.map((img) => img.buffer)
            : imageBuffers[0].buffer;
      }
    }

    logger.info("Foto ottimizzate per tutti i social");
    return optimized;
  } catch (err) {
    logger.error(`Errore nella ottimizzazione foto: ${err.message}`);
    throw err;
  }
}

export async function saveOptimizedPhotos(optimizedPhotos, outputPath) {
  try {
    const fs = await import("fs").then((m) => m.promises);
    const path = await import("path");

    const savedPaths = {};

    for (const [social, buffer] of Object.entries(optimizedPhotos)) {
      const filename = `${outputPath}_${social}.jpg`;
      await fs.writeFile(filename, buffer);
      savedPaths[social] = filename;
      logger.debug(`Foto ${social} salvata: ${filename}`);
    }

    return savedPaths;
  } catch (err) {
    logger.error(`Errore nel salvare foto ottimizzate: ${err.message}`);
    throw err;
  }
}
