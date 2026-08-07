import "dotenv/config";
import fs from "fs";
import { initWordPressAPI } from "../src/wordpressAPI.js";

// Utility per caricare un'immagine fissa (es. header di una mail) nella libreria
// media di WordPress e ottenerne l'URL pubblico stabile, senza dover ricaricarla
// da Telegram ogni volta.
// Uso: node scripts/upload-image.js <percorso-file> <nome-file-destinazione>

async function main() {
  const [filePath, filename] = process.argv.slice(2);
  if (!filePath) {
    console.error("Uso: node scripts/upload-image.js <percorso-file> [nome-file-destinazione]");
    process.exit(1);
  }

  const wp = await initWordPressAPI();
  if (!wp) {
    console.error("WordPress API non configurata (controlla le variabili in .env)");
    process.exit(1);
  }

  const buffer = fs.readFileSync(filePath);
  const mimeType = filePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  const uploaded = await wp.uploadMedia(buffer, filename || `upload-${Date.now()}.jpg`, mimeType);
  console.log(uploaded);
}

main();
