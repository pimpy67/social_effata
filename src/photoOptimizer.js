import sharp from "sharp";
import { logger } from "./logger.js";

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

export async function optimizePhotosForSocial(imageBuffers) {
  try {
    const optimized = {};

    try {
      optimized.story = await Promise.all(
        imageBuffers.map((img) => buildStoryImage(img.buffer))
      );
      logger.debug(`${imageBuffers.length} foto elaborate per le Storie (${STORY_DIMENSIONS.width}x${STORY_DIMENSIONS.height}, crop attention o blur-pad se troppo panoramiche)`);
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
