// Aggiunge i parametri UTM a un link CTA per tracciare in Google Analytics quale
// canale e quale categoria di storia porta al sito (e alle donazioni).
//
// Si applica SOLO ai link del dominio effataitalia.it: un URL esterno (GoFundMe,
// raccolte fondi di terzi, ecc.) viene restituito intatto, perché quei parametri
// non finirebbero comunque nel nostro GA e sporcherebbero solo il link.
//
// File senza dipendenze, importabile ovunque serva costruire un link CTA.

const TRACKED_HOSTS = new Set(["effataitalia.it", "www.effataitalia.it"]);

// "Aiuti sanitari (Carozzine)" -> "aiuti-sanitari-carozzine"
export function slugify(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/\p{Mn}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Data di oggi in formato YYYY-MM-DD, per distinguere in GA le storie pubblicate
// in giorni diversi all'interno della stessa categoria (utm_content).
export function todayStamp(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function addUtmParams(rawUrl, { source, medium = "social", campaign, content } = {}) {
  if (!rawUrl) return rawUrl;

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  if (!TRACKED_HOSTS.has(url.hostname.toLowerCase())) return rawUrl;

  if (source) url.searchParams.set("utm_source", source);
  if (medium) url.searchParams.set("utm_medium", medium);
  if (campaign) url.searchParams.set("utm_campaign", slugify(campaign));
  if (content) url.searchParams.set("utm_content", content);

  return url.toString();
}
