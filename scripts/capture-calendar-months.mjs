// Cattura uno screenshot del calendario VERO (griglia + sfondo del mese + stato
// adozioni) da https://calendario.effataitalia.it per ogni mese visibile, e li
// salva in assets/calendario-mesi-screenshot/YYYY-MM.jpg. Sono le immagini che la
// promo automatica del calendario (src/calendarPromo.js) usa come prima scelta.
//
// Va rieseguito ogni tanto (es. ogni 1-2 mesi) per aggiornare lo stato delle
// adozioni mostrato nella griglia; la promo intanto continua a usare gli
// screenshot esistenti.
//
// USO (richiede Google Chrome installato + puppeteer-core, non incluso di default):
//   npm i -D puppeteer-core
//   node scripts/capture-calendar-months.mjs
//
// Su Windows Chrome è di solito in "C:/Program Files/Google/Chrome/Application/chrome.exe";
// override con la variabile d'ambiente CHROME_PATH.

import puppeteer from "puppeteer-core";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEST = path.join(__dirname, "..", "assets", "calendario-mesi-screenshot");
const CHROME =
  process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "https://calendario.effataitalia.it/";

const MONTHS = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];
const monthKeyFromTitle = (t) => {
  const [name, year] = t.toLowerCase().trim().split(/\s+/);
  return `${year}-${String(MONTHS.indexOf(name) + 1).padStart(2, "0")}`;
};

fs.mkdirSync(DEST, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
  defaultViewport: { width: 1280, height: 1100, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
await page.goto(URL, { waitUntil: "networkidle2", timeout: 60000 });

const seen = new Set();
for (let step = 0; step < 30; step++) {
  await page
    .waitForFunction(() => /url\(/.test(getComputedStyle(document.getElementById("calendarBackground")).backgroundImage), { timeout: 15000 })
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 2600)); // lascia dipingere la foto di sfondo

  const title = await page.$eval("#monthTitle", (el) => el.textContent.trim());
  const key = monthKeyFromTitle(title);
  if (seen.has(key)) break;
  seen.add(key);

  const box = await page.evaluate(() => {
    const card = document.querySelector("#calendar .calendar-card") || document.getElementById("calendar");
    const legend = document.querySelector("#calendar .legend, #calendar .calendar-legend");
    const t = document.getElementById("monthTitle").getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const top = Math.max(t.top - 28, 0);
    const bottom = (legend ? legend.getBoundingClientRect().bottom : c.bottom) + 20;
    return { x: c.left, y: top, w: c.width, h: bottom - top };
  });

  const full = await page.screenshot({ type: "png" });
  await sharp(full)
    .extract({
      left: Math.round(box.x * 2),
      top: Math.round(box.y * 2),
      width: Math.round(box.w * 2),
      height: Math.round(box.h * 2),
    })
    .jpeg({ quality: 90 })
    .toFile(path.join(DEST, `${key}.jpg`));
  console.log(`✓ ${key} (${title})`);

  const atEnd = await page.$eval("#nextMonth", (b) => b.disabled).catch(() => true);
  if (atEnd) break;
  await page.click("#nextMonth");
  await new Promise((r) => setTimeout(r, 700));
}

await browser.close();
console.log(`\nFatti ${seen.size} mesi: ${[...seen].join(", ")}`);
