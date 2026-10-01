import { logger } from "./logger.js";
import { MetaAPI } from "./metaAPI.js";

export class MultiPagePublisher {
  constructor(pages) {
    // pages = [
    //   { name: "Italia", metaAPI, text: italianText, storyText: storyText },
    //   { name: "Uganda", metaAPI, text: englishText, storyText: englishStoryText }
    // ]
    this.pages = pages;
  }

  async publishToAllPages(imageBuffers, options = {}) {
    const results = {
      success: true,
      pages: [],
      errors: [],
    };

    logger.info(`📱 Pubblicazione multi-pagina: ${this.pages.length} pagine`);

    for (const page of this.pages) {
      try {
        logger.info(`\n🌍 Pagina: ${page.name}`);

        const pageResult = await this._publishToPage(page, imageBuffers, options);
        results.pages.push({
          name: page.name,
          ...pageResult,
        });

        if (!pageResult.success) {
          results.success = false;
          results.errors.push(`${page.name}: ${pageResult.error}`);
        }
      } catch (err) {
        results.success = false;
        results.errors.push(`${page.name}: ${err.message}`);
        logger.error(`Errore pubblicazione ${page.name}: ${err.message}`);
      }
    }

    if (results.errors.length > 0) {
      logger.warn(`\n⚠️ Errori durante la pubblicazione: ${results.errors.join(" | ")}`);
    } else {
      logger.info("\n✅ Pubblicazione completata con successo su tutte le pagine");
    }

    return results;
  }

  async _publishToPage(page, imageBuffers, options = {}) {
    const metaAPI = page.metaAPI;
    const facebookText = page.text;

    if (!metaAPI || !facebookText) {
      return {
        success: false,
        error: "MetaAPI o testo non disponibile",
      };
    }

    try {
      // Pubblica il post Facebook (come bozza)
      logger.info(`  📄 Post Facebook...`);
      const fbResult = await metaAPI.publishToFacebook(facebookText, imageBuffers);

      if (!fbResult.success) {
        return {
          success: false,
          error: `Facebook: ${fbResult.error}`,
        };
      }

      logger.info(`  ✓ Post Facebook creato (bozza): ${fbResult.postId}`);

      // Pubblica su Instagram
      logger.info(`  📷 Post Instagram...`);
      const igResult = await metaAPI.publishToInstagram(facebookText, imageBuffers);

      if (!igResult.success) {
        return {
          success: false,
          error: `Instagram: ${igResult.error}`,
        };
      }

      logger.info(`  ✓ Post Instagram pubblicato: ${igResult.mediaId}`);

      // Storie (opzionali, best-effort)
      if (page.storyText && options.publishStories !== false) {
        logger.info(`  📖 Storie...`);
        try {
          const fbStoryResult = await metaAPI.publishFacebookStory(imageBuffers);
          if (fbStoryResult.success) {
            logger.info(`  ✓ Storie Facebook: ${fbStoryResult.storyIds.length} pubblicate`);
          }
        } catch (err) {
          logger.warn(`  ⚠️ Storie Facebook: ${err.message}`);
        }

        try {
          const igStoryResult = await metaAPI.publishInstagramStory(imageBuffers);
          if (igStoryResult.success) {
            logger.info(`  ✓ Storie Instagram: ${igStoryResult.storyIds.length} pubblicate`);
          }
        } catch (err) {
          logger.warn(`  ⚠️ Storie Instagram: ${err.message}`);
        }
      }

      return {
        success: true,
        facebookPostId: fbResult.postId,
        instagramMediaId: igResult.mediaId,
      };
    } catch (err) {
      return {
        success: false,
        error: err.message,
      };
    }
  }

  // Pubblica solo i post (senza storie)
  async publishPostsOnly(imageBuffers) {
    return this.publishToAllPages(imageBuffers, { publishStories: false });
  }
}

// Helper per inizializzare il publisher con Italia e Uganda
export async function initMultiPagePublisher(enableUganda = true) {
  const pages = [];

  // Pagina Italia (sempre)
  const pageAccessTokenIt = process.env.META_PAGE_ACCESS_TOKEN_IT || process.env.META_PAGE_ACCESS_TOKEN;
  const pageIdIt = process.env.META_PAGE_ID_IT || process.env.META_PAGE_ID;

  if (pageAccessTokenIt && pageIdIt) {
    const metaAPIIt = new MetaAPI(pageAccessTokenIt, pageIdIt);
    await metaAPIIt.initialize();
    pages.push({
      name: "Italia 🇮🇹",
      metaAPI: metaAPIIt,
      pageId: pageIdIt,
      language: "it",
    });
  }

  // Pagina Uganda (se abilitata e configurata)
  if (enableUganda) {
    const pageAccessTokenUg = process.env.META_PAGE_ACCESS_TOKEN_UG;
    const pageIdUg = process.env.META_PAGE_ID_UG;

    if (pageAccessTokenUg && pageIdUg) {
      const metaAPIUg = new MetaAPI(pageAccessTokenUg, pageIdUg);
      await metaAPIUg.initialize();
      pages.push({
        name: "Uganda 🇺🇬",
        metaAPI: metaAPIUg,
        pageId: pageIdUg,
        language: "en",
      });
    } else {
      logger.warn("Uganda non configurata (META_PAGE_ACCESS_TOKEN_UG o META_PAGE_ID_UG mancanti)");
    }
  }

  if (pages.length === 0) {
    logger.error("Nessuna pagina Meta configurata!");
    return null;
  }

  return {
    pages,
    async publish(italianContent, englishContent, imageBuffers) {
      const publishPages = [];

      for (const page of pages) {
        if (page.language === "it") {
          publishPages.push({
            ...page,
            text: italianContent.facebookPost,
            storyText: italianContent.storySlides,
          });
        } else if (page.language === "en") {
          publishPages.push({
            ...page,
            text: englishContent.facebookPost,
            storyText: englishContent.storySlides,
          });
        }
      }

      const publisher = new MultiPagePublisher(publishPages);
      return await publisher.publishToAllPages(imageBuffers);
    },
  };
}

export { MetaAPI };
