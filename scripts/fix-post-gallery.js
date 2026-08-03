import "dotenv/config";
import { initWordPressAPI, buildGalleryBlock } from "../src/wordpressAPI.js";

// Utility una tantum: converte lo shortcode [gallery ids="..."] (vecchio formato,
// usato dal bot prima del fix del 2026-08-03) in un articolo già esistente nel
// blocco Gutenberg wp:gallery, senza dover ricaricare le foto da Telegram.
// Uso: node scripts/fix-post-gallery.js <postId>

async function main() {
  const postId = process.argv[2];
  if (!postId) {
    console.error("Uso: node scripts/fix-post-gallery.js <postId>");
    process.exit(1);
  }

  const wp = await initWordPressAPI();
  if (!wp) {
    console.error("WordPress API non configurata (controlla le variabili in .env)");
    process.exit(1);
  }

  const { data: post } = await wp.client.get(`/posts/${postId}`, { params: { context: "edit" } });
  const rawContent = post.content.raw;

  const match = rawContent.match(/\[gallery ids="([\d,]+)"\]/);
  if (!match) {
    console.log(`Nessuno shortcode [gallery] trovato nell'articolo ${postId}: niente da correggere.`);
    return;
  }

  const ids = match[1].split(",");
  const media = [];
  for (const id of ids) {
    const { data } = await wp.client.get(`/media/${id}`);
    media.push({ id: data.id, url: data.source_url });
  }

  const newContent = rawContent.replace(match[0], buildGalleryBlock(media));

  await wp.client.post(`/posts/${postId}`, { content: newContent });
  console.log(`Articolo ${postId} aggiornato: galleria convertita in blocco Gutenberg (${media.length} foto).`);
}

main().catch((err) => {
  console.error(err.response?.data || err.message);
  process.exit(1);
});
