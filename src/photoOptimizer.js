import sharp from "sharp";
import { logger } from "./logger.js";

// Dimensioni massime per ogni social (width x height in px). Usate come limite,
// non come rapporto forzato: la foto viene rimpicciolita se serve ma non
// ritagliata, per non tagliare mai volti o dettagli importanti.
const SOCIAL_DIMENSIONS = {
  facebook: { width: 1200, height: 1200 },
  instagram: { width: 1200, height: 1200 },
  linkedin: { width: 1200, height: 1200 },
  blog: { width: 1000, height: 1000 },
  reel: { width: 1200, height: 1200 },
};

export async function optimizePhotosForSocial(imageBuffers) {
  try {
    const optimized = {};

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
