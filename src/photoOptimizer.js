import sharp from "sharp";
import { logger } from "./logger.js";

// Dimensioni ottimali per ogni social (width x height in px)
const SOCIAL_DIMENSIONS = {
  facebook: { width: 1200, height: 628, fit: "cover" },
  instagram: { width: 1080, height: 1920, fit: "cover" },
  linkedin: { width: 1200, height: 627, fit: "cover" },
  blog: { width: 800, height: 600, fit: "cover" },
  reel: { width: 1080, height: 1920, fit: "cover" },
};

export async function optimizePhotosForSocial(imageBuffers) {
  try {
    const optimized = {};

    // Crea versioni ottimizzate per ogni social
    for (const [social, dimensions] of Object.entries(SOCIAL_DIMENSIONS)) {
      try {
        if (social === "facebook") {
          // Facebook supporta più foto per post: ottimizza tutte quelle caricate
          optimized.facebook = await Promise.all(
            imageBuffers.map((img) =>
              sharp(img.buffer)
                .resize(dimensions.width, dimensions.height, {
                  fit: dimensions.fit,
                  position: "center",
                })
                .jpeg({ quality: 90, progressive: true })
                .toBuffer()
            )
          );
          logger.debug(`${imageBuffers.length} foto ottimizzate per facebook (${dimensions.width}x${dimensions.height})`);
          continue;
        }

        // Gli altri social usano un solo post/immagine: la prima foto
        const buffer = imageBuffers[0].buffer;

        optimized[social] = await sharp(buffer)
          .resize(dimensions.width, dimensions.height, {
            fit: dimensions.fit,
            position: "center",
          })
          .jpeg({ quality: 90, progressive: true })
          .toBuffer();

        logger.debug(`Foto ottimizzata per ${social} (${dimensions.width}x${dimensions.height})`);
      } catch (err) {
        logger.warn(`Errore nell'ottimizzare foto per ${social}: ${err.message}`);
        // Fallback: usa la foto originale se l'ottimizzazione fallisce
        optimized[social] = social === "facebook" ? imageBuffers.map((img) => img.buffer) : imageBuffers[0].buffer;
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
