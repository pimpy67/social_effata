import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TRANSLATION_SYSTEM = `Sei un traduttore professionista specializzato in traduzioni per social media.
Traduci il contenuto dall'italiano all'inglese mantenendo:
- Il tono e lo stile originale (emotivo per Facebook, professionale per LinkedIn)
- Hashtag in inglese (oppure lasciati come sono se universali)
- Link e URL intatti
- Nomi propri intatti
- La lunghezza approssimativamente simile

Fornisci SOLO la traduzione, senza spiegazioni aggiuntive.`;

export async function translateToEnglish(italianText) {
  if (!italianText || italianText.trim().length === 0) {
    return "";
  }

  try {
    logger.debug(`Traduzione in corso: ${italianText.substring(0, 100)}...`);

    const message = await client.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      system: TRANSLATION_SYSTEM,
      messages: [
        {
          role: "user",
          content: italianText,
        },
      ],
    });

    const englishText = message.content[0].type === "text" ? message.content[0].text : "";
    logger.info(`Traduzione completata: ${englishText.substring(0, 100)}...`);

    return englishText.trim();
  } catch (err) {
    logger.error(`Errore nella traduzione: ${err.message}`);
    throw err;
  }
}

// Traduce tutti i campi di un contenuto generato da generateContent.js
export async function translateStoryContent(italianContent) {
  try {
    logger.info("Traduzione del contenuto completo in inglese...");

    const translated = {
      facebookPost: await translateToEnglish(italianContent.facebookPost),
      instagramStory: await translateToEnglish(italianContent.instagramStory),
      linkedinPost: await translateToEnglish(italianContent.linkedinPost),
      blogTitle: await translateToEnglish(italianContent.blogTitle),
      blogBody: await translateToEnglish(italianContent.blogBody),
      reelScript: await translateToEnglish(italianContent.reelScript),
      youtubeShorts: {
        titolo: await translateToEnglish(italianContent.youtubeShorts.titolo),
        script: await translateToEnglish(italianContent.youtubeShorts.script),
        istruzioni: await translateToEnglish(italianContent.youtubeShorts.istruzioni),
        cta: await translateToEnglish(italianContent.youtubeShorts.cta),
      },
      storySlides: await Promise.all(
        italianContent.storySlides.map((slide) => translateToEnglish(slide))
      ),
    };

    logger.info("Traduzione completa ✓");
    return translated;
  } catch (err) {
    logger.error(`Errore nella traduzione del contenuto: ${err.message}`);
    throw err;
  }
}
