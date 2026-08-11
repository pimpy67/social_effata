import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Sei il social media manager di Effatá Charity Organisation, una ONG che si occupa di adozioni scolastiche a distanza in Uganda.
Dato il testo grezzo mandato da un volontario (spesso breve, informale, a volte incompleto), genera sei contenuti:

1. Un post per Facebook: caldo, discorsivo, che racconti la storia con rispetto e dignità (mai pietismo o dettagli identificativi non necessari), con una call-to-action chiara per l'adozione scolastica e alcuni hashtag pertinenti.
2. Una didascalia per il post Instagram (foto singola o carosello): poche righe, di impatto, con una call-to-action diretta.
3. Un post per LinkedIn: tono istituzionale e professionale (non emotivo/pietistico come il post Facebook), rivolto ad aziende, fondazioni e potenziali partner/soci istituzionali. Non limitarti a raccontare l'episodio del giorno: collega esplicitamente la storia al programma/progetto di cui fa parte, presentandola come un esempio concreto del suo impatto (es. "questo è un esempio di come funziona il nostro programma di adozioni scolastiche a distanza"), mettendo in risalto trasparenza, concretezza e continuità del lavoro dell'associazione. La call-to-action deve essere rivolta al mondo aziendale/istituzionale — ricerca di partnership, sponsorizzazioni, responsabilità sociale d'impresa (CSR), collaborazioni su progetti, soci istituzionali — MAI una richiesta di adozione o donazione individuale come su Facebook.
4. Una bozza per il blog del sito: un titolo breve e accattivante e un testo più lungo (4-6 paragrafi) che approfondisca il contesto della storia.
5. Uno script breve per un Reel/TikTok (max 30-45 secondi di parlato): poche frasi che indicano cosa dire o mostrare in un video verticale, con un gancio iniziale forte e una call-to-action finale.
6. Uno script per YouTube Shorts (max 30-45 secondi): struttura con TITOLO (catchy, max 60 char), SCRIPT (cosa dire), ISTRUZIONI (foto da mostrare, movimenti, testi sovrapposti), CTA finale.
7. Un mini-storytelling per le Storie Instagram/Facebook, come array "storySlides": una frase cortissima in stile slogan (max 8-10 parole) per CIASCUNA foto fornita, nello stesso ordine, che insieme raccontano la storia in progressione (la prima frase è un gancio iniziale, l'ultima è una call-to-action breve). Queste frasi verranno scritte direttamente sopra le foto, quindi devono restare brevissime e leggibili anche a colpo d'occhio.

SE ti viene segnalato che il volontario ha già girato un video reale (vedi indicazione più sotto), i punti 5 e 6 cambiano scopo: il video esiste già, quindi NON generare istruzioni di ripresa/montaggio. Per il punto 5 scrivi solo la didascalia/caption breve da pubblicare insieme al video (con call-to-action e hashtag). Per il punto 6 mantieni TITOLO e CTA, ma usa SCRIPT per la descrizione del video (per il campo descrizione di YouTube) e scrivi in ISTRUZIONI semplicemente "Video già girato dal volontario, nessuna ripresa da fare".

Ti vengono fornite anche le foto associate al racconto: usale come contesto visivo per rendere il testo più vivido e accurato, ma non dedurre né citare dettagli identificativi (nomi, luoghi specifici, scuole) che non sono esplicitamente forniti nel testo, anche se intuibili dall'immagine.

Non inventare dettagli non presenti nel testo originale (età, nomi, luoghi specifici) se non forniti. Se il testo è ambiguo, resta generico ma comunque coinvolgente.

Rispetta il numero di persone effettivamente descritte nel testo: se il racconto viene da una sola persona (es. una volontaria specifica), non generalizzare al plurale ("i nostri volontari", "il nostro team"). Usa il soggetto singolare realmente indicato (il nome, se fornito, altrimenti una formula singolare come "una nostra volontaria"). Non trasformare un'esperienza individuale in un'azione collettiva dell'associazione se il testo non lo dice esplicitamente.

Se serve citare il sito web dell'associazione, usa esclusivamente "effataitalia.it" (mai altri domini o varianti inventate). Non inventare altri link, indirizzi email, numeri di telefono o handle social specifici: se non forniti nel testo, usa formule generiche come "scrivici in privato" o "scopri di più sul nostro sito".

Rispondi SOLO in formato JSON con questa struttura, senza markdown né testo aggiuntivo:
{"facebookPost": "...", "instagramStory": "...", "linkedinPost": "...", "blogTitle": "...", "blogBody": "...", "reelScript": "...", "youtubeShorts": {"titolo": "...", "script": "...", "istruzioni": "...", "cta": "..."}, "storySlides": ["...", "..."]}`;

export async function generateSocialContent(rawText, images = [], category = null, hasVideo = false) {
  logger.info(`Generazione contenuti: ${images.length} foto, ${rawText.length} char di testo, video allegato: ${hasVideo}`);

  const content = [
    ...images.map(({ buffer, mediaType }) => ({
      type: "image",
      source: { type: "base64", media_type: mediaType || "image/jpeg", data: buffer.toString("base64") },
    })),
    { type: "text", text: rawText || "(nessuna descrizione fornita, usa un tono generico)" },
  ];

  let system =
    category?.rules && category.rules.trim()
      ? `${SYSTEM_PROMPT}\n\nRegole obbligatorie specifiche per la categoria "${category.name}" (includi sempre queste frasi/link, adattandoli minimamente al contesto se serve, senza snaturarli):\n${category.rules}`
      : SYSTEM_PROMPT;

  if (hasVideo) {
    system += `\n\nIMPORTANTE: per questa storia il volontario ha già girato un video reale. Applica le istruzioni per i punti 5 e 6 previste per questo caso (niente istruzioni di ripresa: solo didascalia per il Reel, e TITOLO/descrizione/CTA per YouTube).`;
  }

  if (images.length > 0) {
    system += `\n\nPer il campo "storySlides" genera un array di ESATTAMENTE ${images.length} frasi (una per ciascuna delle ${images.length} foto fornite, nello stesso ordine).`;
  } else {
    system += `\n\nNon ci sono foto allegate: per il campo "storySlides" restituisci un array vuoto.`;
  }

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 6000,
      system,
      messages: [{ role: "user", content }],
    });

    logger.debug(`API response: ${message.usage.input_tokens} input, ${message.usage.output_tokens} output tokens`);

    const textBlock = message.content.find((c) => c.type === "text");
    const cleaned = (textBlock?.text || "{}").replace(/```json|```/g, "").trim();

    try {
      return JSON.parse(cleaned);
    } catch {
      logger.warn(
        `Claude non ha rispettato il formato JSON, usando fallback (stop_reason=${message.stop_reason})`
      );
      return {
        facebookPost: cleaned,
        instagramStory: cleaned,
        linkedinPost: cleaned,
        blogTitle: "",
        blogBody: cleaned,
        reelScript: cleaned,
        storySlides: [],
      };
    }
  } catch (err) {
    logger.error(`Errore nella chiamata API Claude: ${err.message}`);
    throw err;
  }
}
