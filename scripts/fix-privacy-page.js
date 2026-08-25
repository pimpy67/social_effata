import "dotenv/config";
import fs from "fs";
import axios from "axios";
import { logger } from "../src/logger.js";

// Script una tantum: aggiorna il contenuto della pagina "Privacy Policy" (id=3 su
// effataitalia.it) con il testo corretto (rimossa nota placeholder DPO, aggiunte
// sezioni su donazioni, piattaforme social Meta, minori). Uso:
// node scripts/fix-privacy-page.js <percorso-file-html> <page-id>

const [, , htmlPath, pageIdArg] = process.argv;
const pageId = pageIdArg || "3";

if (!htmlPath) {
  console.error("Uso: node scripts/fix-privacy-page.js <percorso-file-html> [page-id]");
  process.exit(1);
}

const content = fs.readFileSync(htmlPath, "utf-8");

const siteUrl = process.env.WORDPRESS_URL;
const username = process.env.WORDPRESS_USERNAME;
const appPassword = process.env.WORDPRESS_APP_PASSWORD;

if (!siteUrl || !username || !appPassword) {
  console.error("Mancano le credenziali WordPress in .env");
  process.exit(1);
}

const client = axios.create({
  baseURL: `${siteUrl}/wp-json/wp/v2`,
  auth: { username, password: appPassword },
});

try {
  const response = await client.post(`/pages/${pageId}`, { content });
  logger.info(`Pagina ${pageId} aggiornata: ${response.data.link}`);
  console.log("OK", response.data.link, response.data.modified);
} catch (err) {
  console.error("Errore:", err.response?.data?.message || err.message);
  process.exit(1);
}
