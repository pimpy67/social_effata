import { logger } from "./logger.js";
import { MetaAPI } from "./metaAPI.js";
import { translateStoryContent } from "./translateContent.js";

// Helper semplificato per pubblicare su Italia e Uganda con testi diversi
export async function publishToItalyAndUganda(italianContent, images, options = {}) {
  const { publishStories = true, optimizedPhotos = null } = options;

  logger.info("🌍 Inizio pubblicazione multi-pagina (Italia + Uganda)...\n");

  // Inizializza le due pagine
  const pageAccessTokenIt = process.env.META_PAGE_ACCESS_TOKEN_IT || process.env.META_PAGE_ACCESS_TOKEN;
  const pageIdIt = process.env.META_PAGE_ID_IT || process.env.META_PAGE_ID;
  const pageAccessTokenUg = process.env.META_PAGE_ACCESS_TOKEN_UG;
  const pageIdUg = process.env.META_PAGE_ID_UG;

  if (!pageAccessTokenIt || !pageIdIt) {
    return {
      success: false,
      error: "Pagina Italia non configurata",
      pages: [],
    };
  }

  const results = {
    success: true,
    pages: [],
    errors: [],
    // Compatibilità con il vecchio telegramBot.js
    facebook: null,
    instagram: null,
    facebookStory: null,
    instagramStory: null,
  };

  let itResult = null;

  // Pagina Italia (testo italiano)
  try {
    logger.info("📘 Pagina Italia - Pubblicazione...");
    const metaAPIIt = new MetaAPI(pageAccessTokenIt, pageIdIt);
    await metaAPIIt.initialize();

    itResult = await metaAPIIt.publishToMetaBusiness(
      italianContent.facebookPost,
      italianContent.instagramStory,
      images,
      optimizedPhotos
    );

    results.pages.push({
      name: "Italia 🇮🇹",
      ...itResult,
    });

    // Copia i risultati Italia al top level per compatibilità
    results.facebook = itResult.facebook;
    results.instagram = itResult.instagram;
    results.facebookStory = itResult.facebookStory;
    results.instagramStory = itResult.instagramStory;

    if (itResult.facebook?.success) {
      logger.info(`  ✓ Facebook (post): ${itResult.facebook.postId}`);
    }
    if (itResult.instagram?.success) {
      logger.info(`  ✓ Instagram (post): ${itResult.instagram.mediaId}`);
    }
    if (itResult.facebookStory?.success) {
      logger.info(`  ✓ Facebook Story: ${itResult.facebookStory.storyIds?.length || 1} pubblicata(e)`);
    }
    if (itResult.instagramStory?.success) {
      logger.info(`  ✓ Instagram Story: ${itResult.instagramStory.storyIds?.length || 1} pubblicata(e)`);
    }

    if (itResult.errors?.length > 0) {
      logger.warn(`  ⚠️ Errori Italia: ${itResult.errors.join(", ")}`);
      results.errors.push(...itResult.errors.map((e) => `Italia: ${e}`));
    }
  } catch (err) {
    const error = `Italia: ${err.message}`;
    logger.error(`  ❌ ${error}`);
    results.errors.push(error);
    results.success = false;
  }

  // Pagina Uganda (testo inglese, se configurata)
  if (pageAccessTokenUg && pageIdUg) {
    try {
      logger.info("\n📱 Pagina Uganda - Traduzione e pubblicazione...");

      // Traduci il contenuto in inglese
      logger.debug("  Traduzione in inglese...");
      const englishContent = await translateStoryContent(italianContent);
      logger.info("  ✓ Traduzione completata");

      const metaAPIUg = new MetaAPI(pageAccessTokenUg, pageIdUg);
      await metaAPIUg.initialize();

      const ugResult = await metaAPIUg.publishToMetaBusiness(
        englishContent.facebookPost,
        englishContent.instagramStory,
        images,
        optimizedPhotos
      );

      results.pages.push({
        name: "Uganda 🇺🇬",
        ...ugResult,
      });

      if (ugResult.facebook?.success) {
        logger.info(`  ✓ Facebook (post): ${ugResult.facebook.postId}`);
      }
      if (ugResult.instagram?.success) {
        logger.info(`  ✓ Instagram (post): ${ugResult.instagram.mediaId}`);
      }
      if (ugResult.facebookStory?.success) {
        logger.info(`  ✓ Facebook Story: ${ugResult.facebookStory.storyIds?.length || 1} pubblicata(e)`);
      }
      if (ugResult.instagramStory?.success) {
        logger.info(`  ✓ Instagram Story: ${ugResult.instagramStory.storyIds?.length || 1} pubblicata(e)`);
      }

      if (ugResult.errors?.length > 0) {
        logger.warn(`  ⚠️ Errori Uganda: ${ugResult.errors.join(", ")}`);
        results.errors.push(...ugResult.errors.map((e) => `Uganda: ${e}`));
      }
    } catch (err) {
      const error = `Uganda: ${err.message}`;
      logger.error(`  ❌ ${error}`);
      results.errors.push(error);
      results.success = false;
    }
  } else {
    logger.info("\n⚠️  Pagina Uganda non configurata (META_PAGE_ACCESS_TOKEN_UG / META_PAGE_ID_UG mancanti)");
  }

  logger.info(`\n📊 Riepilogo: ${results.pages.length} pagina(e) processata(e)`);
  if (results.errors.length > 0) {
    logger.warn(`⚠️ Errori totali: ${results.errors.length}`);
  } else {
    logger.info("✅ Nessun errore");
  }

  return results;
}
