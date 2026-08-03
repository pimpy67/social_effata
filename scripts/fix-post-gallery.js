import "dotenv/config";
import { initWordPressAPI, buildGalleryBlock, buildCtaButtonBlock } from "../src/wordpressAPI.js";

// Utility una tantum per correggere un articolo del blog già creato dal bot prima
// dei fix del 2026-08-03:
// 1) converte lo shortcode [gallery ids="..."] (vecchio formato) nel blocco
//    Gutenberg wp:gallery, senza dover ricaricare le foto da Telegram;
// 2) se passato un link, aggiunge il bottone CTA (il bot ora lo chiede sempre
//    prima di /genera, ma gli articoli creati prima di questo fix non ce l'hanno).
// Uso: node scripts/fix-post-gallery.js <postId> [ctaLink]

async function main() {
  const [postId, ctaLink] = process.argv.slice(2);
  if (!postId) {
    console.error("Uso: node scripts/fix-post-gallery.js <postId> [ctaLink]");
    process.exit(1);
  }

  const wp = await initWordPressAPI();
  if (!wp) {
    console.error("WordPress API non configurata (controlla le variabili in .env)");
    process.exit(1);
  }

  const { data: post } = await wp.client.get(`/posts/${postId}`, { params: { context: "edit" } });
  let content = post.content.raw;
  let changed = false;

  const galleryMatch = content.match(/\[gallery ids="([\d,]+)"\]/);
  if (galleryMatch) {
    const ids = galleryMatch[1].split(",");
    const media = [];
    for (const id of ids) {
      const { data } = await wp.client.get(`/media/${id}`);
      media.push({ id: data.id, url: data.source_url });
    }
    content = content.replace(galleryMatch[0], buildGalleryBlock(media));
    changed = true;
    console.log(`Galleria convertita in blocco Gutenberg (${media.length} foto).`);
  }

  if (ctaLink && !content.includes("wp-block-button__link")) {
    const ctaBlock = buildCtaButtonBlock(ctaLink);
    // Se c'è una galleria, il bottone va subito prima (come negli articoli di
    // esempio); altrimenti in fondo al testo.
    content = content.includes("<!-- wp:gallery")
      ? content.replace("<!-- wp:gallery", `${ctaBlock}\n\n<!-- wp:gallery`)
      : `${content}\n\n${ctaBlock}`;
    changed = true;
    console.log("Bottone CTA aggiunto.");
  }

  if (!changed) {
    console.log(`Niente da correggere nell'articolo ${postId}.`);
    return;
  }

  await wp.client.post(`/posts/${postId}`, { content });
  console.log(`Articolo ${postId} aggiornato.`);
}

main().catch((err) => {
  console.error(err.response?.data || err.message);
  process.exit(1);
});
