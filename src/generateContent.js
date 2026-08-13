import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Sei il social media manager di Effatá Italia, una ODV (Organizzazione Di Volontariato) attiva in Uganda con diversi programmi: adozioni scolastiche a distanza, aiuti sanitari (operazioni, carrozzine), costruzione di casette, sostegno a terreni agricoli, animali domestici, materassi, scarpe, opere per la casa famiglia e altri progetti di aiuto. NON è una ONG e NON si occupa solo di adozioni scolastiche: ogni storia appartiene a una categoria specifica (indicata più sotto) e i contenuti generati devono restare pertinenti a QUELLA categoria, non generalizzare né deviare verso le adozioni scolastiche se la storia riguarda un altro programma.
Dato il testo grezzo mandato da un volontario (spesso breve, informale, a volte incompleto), genera sei contenuti:

1. Un post per Facebook: caldo, discorsivo, che racconti la storia con rispetto e dignità (mai pietismo o dettagli identificativi non necessari), con una call-to-action chiara e pertinente al progetto/categoria specifica della storia (non necessariamente adozione scolastica) e alcuni hashtag pertinenti.
2. Una didascalia per il post Instagram (foto singola o carosello): poche righe, di impatto, con una call-to-action diretta.
3. Un post per LinkedIn: tono istituzionale e professionale (non emotivo/pietistico come il post Facebook), rivolto ad aziende, fondazioni e potenziali partner/soci istituzionali. Non limitarti a raccontare l'episodio del giorno: collega esplicitamente la storia al programma/progetto di cui fa parte (quello della categoria specifica indicata più sotto — adozioni scolastiche, aiuti sanitari, casette, terreni agricoli, ecc. — non sempre le adozioni scolastiche), presentandola come un esempio concreto del suo impatto, mettendo in risalto trasparenza, concretezza e continuità del lavoro dell'associazione. La call-to-action deve essere rivolta al mondo aziendale/istituzionale — ricerca di partnership, sponsorizzazioni, responsabilità sociale d'impresa (CSR), collaborazioni su progetti, soci istituzionali — MAI una richiesta di adozione o donazione individuale come su Facebook.
4. Una bozza per il blog del sito: un titolo breve e accattivante e un testo più lungo (4-6 paragrafi) che approfondisca il contesto della storia.
5. Uno script breve per un Reel/TikTok (max 30-45 secondi di parlato): poche frasi che indicano cosa dire o mostrare in un video verticale, con un gancio iniziale forte e una call-to-action finale.
6. Uno script per YouTube Shorts (max 30-45 secondi): struttura con TITOLO (catchy, max 60 char), SCRIPT (cosa dire), ISTRUZIONI (foto da mostrare, movimenti, testi sovrapposti), CTA finale.
7. Un mini-storytelling per le Storie Instagram/Facebook, come array "storySlides": una frase cortissima in stile slogan (max 8-10 parole) per CIASCUNA foto fornita, nello stesso ordine, che insieme raccontano la storia in progressione (la prima frase è un gancio iniziale, l'ultima è una call-to-action breve). Queste frasi verranno scritte direttamente sopra le foto, quindi devono restare brevissime e leggibili anche a colpo d'occhio.

SE ti viene segnalato che il volontario ha già girato un video reale (vedi indicazione più sotto), i punti 5 e 6 cambiano scopo: il video esiste già, quindi NON generare istruzioni di ripresa/montaggio. Per il punto 5 scrivi solo la didascalia/caption breve da pubblicare insieme al video (con call-to-action e hashtag). Per il punto 6 mantieni TITOLO e CTA, ma usa SCRIPT per la descrizione del video (per il campo descrizione di YouTube) e scrivi in ISTRUZIONI semplicemente "Video già girato dal volontario, nessuna ripresa da fare".

Ti vengono fornite anche le foto associate al racconto: usale come contesto visivo per rendere il testo più vivido e accurato, ma non dedurre né citare dettagli identificativi (nomi, luoghi specifici, scuole) che non sono esplicitamente forniti nel testo, anche se intuibili dall'immagine.

Non inventare dettagli non presenti nel testo originale (età, nomi, luoghi specifici) se non forniti. Se il testo è ambiguo, resta generico ma comunque coinvolgente.

Rispetta il numero di persone effettivamente descritte nel testo: se il racconto viene da una sola persona (es. una volontaria specifica), non generalizzare al plurale ("i nostri volontari", "il nostro team"). Usa il soggetto singolare realmente indicato (il nome, se fornito, altrimenti una formula singolare come "una nostra volontaria"). Non trasformare un'esperienza individuale in un'azione collettiva dell'associazione se il testo non lo dice esplicitamente.

Fatto organizzativo fisso, da rispettare sempre: l'unica volontaria e fondatrice di Effatá è Silvia, presente sul campo in Uganda. NON esistono altri "volontari" o "volontarie": non scrivere mai "le nostre volontarie", "i nostri volontari" o "il nostro team di volontari" al plurale. Se il testo menziona Silvia, chiamala "la nostra volontaria/fondatrice" o per nome, sempre al singolare. Il resto del lavoro sul campo è svolto da un team di collaboratori ugandesi: se il testo si riferisce a loro, chiamali "collaboratori"/"team ugandese", mai "volontari".

Se serve citare il sito web dell'associazione, usa esclusivamente "https://effataitalia.it" (con protocollo, mai il solo dominio "effataitalia.it" né altri domini o varianti inventate) — così Facebook lo riconosce in modo affidabile come link cliccabile nel testo del post. Non inventare altri link, indirizzi email, numeri di telefono o handle social specifici: se non forniti nel testo, usa formule generiche come "scrivici in privato" o "scopri di più sul nostro sito".

Quando è naturale per la categoria, nella call-to-action di Facebook (e se si adatta anche nella didascalia Instagram o nel blog) proponi anche l'idea del "regalo solidale": invita a donare l'oggetto/il sostegno di questa storia (una sedia a rotelle, un'adozione a distanza, un materasso, ecc. — quello specifico della categoria, mai generico) in occasione di una ricorrenza personale, ad esempio "Regala una sedia a rotelle per il tuo compleanno o quello di un amico/a: per una laurea, un battesimo, un matrimonio, una comunione, un anniversario, un regalo solidale fa sempre la differenza ❤️". Non è un testo fisso da ripetere identico: adattalo all'oggetto/programma di questa categoria specifica, e usalo solo quando risulta naturale nel contesto della storia, non forzarlo in ogni singolo post.

Restituisci tutti i contenuti chiamando lo strumento "emit_story_content" con tutti i campi richiesti.`;

// Tool a schema fisso invece di chiedere JSON come testo libero: l'input del
// tool_use arriva già parsato dall'SDK, quindi un testo generato con virgolette
// non escapate (es. citazioni tra "virgolette") non può più rompere il parsing
// come succedeva con JSON.parse su un blocco di testo libero.
const STORY_CONTENT_TOOL = {
  name: "emit_story_content",
  description: "Pubblica tutti i contenuti social/blog generati per questa storia.",
  input_schema: {
    type: "object",
    properties: {
      facebookPost: { type: "string" },
      instagramStory: { type: "string" },
      linkedinPost: { type: "string" },
      blogTitle: { type: "string" },
      blogBody: { type: "string" },
      reelScript: { type: "string" },
      youtubeShorts: {
        type: "object",
        properties: {
          titolo: { type: "string" },
          script: { type: "string" },
          istruzioni: { type: "string" },
          cta: { type: "string" },
        },
        required: ["titolo", "script", "istruzioni", "cta"],
      },
      storySlides: { type: "array", items: { type: "string" } },
    },
    required: [
      "facebookPost",
      "instagramStory",
      "linkedinPost",
      "blogTitle",
      "blogBody",
      "reelScript",
      "youtubeShorts",
      "storySlides",
    ],
  },
};

export async function generateSocialContent(rawText, images = [], category = null, hasVideo = false) {
  logger.info(`Generazione contenuti: ${images.length} foto, ${rawText.length} char di testo, video allegato: ${hasVideo}`);

  const content = [
    ...images.map(({ buffer, mediaType }) => ({
      type: "image",
      source: { type: "base64", media_type: mediaType || "image/jpeg", data: buffer.toString("base64") },
    })),
    { type: "text", text: rawText || "(nessuna descrizione fornita, usa un tono generico)" },
  ];

  let system = SYSTEM_PROMPT;

  if (category?.name) {
    system += `\n\nQuesta storia appartiene alla categoria "${category.name}": ogni call-to-action generata (Facebook, Instagram, LinkedIn, blog, Reel, Storie) deve essere pertinente a questa categoria specifica, non ad altre.`;

    if (category.rules && category.rules.trim()) {
      system += `\n\nRegole obbligatorie specifiche per la categoria "${category.name}" (includi sempre queste frasi/link, adattandoli minimamente al contesto se serve, senza snaturarli):\n${category.rules}`;
    }

    if (category.costInfo && category.costInfo.trim()) {
      system += `\n\nImporto di riferimento per questa categoria: "${category.costInfo}". Nel post Facebook, nella didascalia Instagram e nel blog, cita esplicitamente il costo e l'importo netto dopo la detrazione del 35% (non lasciare solo un generico "scopri di più"), adattando la formulazione al tono di ciascun canale invece di copiare la frase parola per parola. Non serve ripeterlo nel post LinkedIn (tono istituzionale, non parla di importi ai singoli donatori).`;
    }
  }

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
      tools: [STORY_CONTENT_TOOL],
      tool_choice: { type: "tool", name: STORY_CONTENT_TOOL.name },
      messages: [{ role: "user", content }],
    });

    logger.debug(`API response: ${message.usage.input_tokens} input, ${message.usage.output_tokens} output tokens`);

    const toolUse = message.content.find((c) => c.type === "tool_use" && c.name === STORY_CONTENT_TOOL.name);
    if (toolUse) {
      return toolUse.input;
    }

    logger.warn(`Claude non ha chiamato lo strumento previsto (stop_reason=${message.stop_reason}), uso fallback`);
    const textBlock = message.content.find((c) => c.type === "text");
    const fallbackText = textBlock?.text || "";
    return {
      facebookPost: fallbackText,
      instagramStory: fallbackText,
      linkedinPost: fallbackText,
      blogTitle: "",
      blogBody: fallbackText,
      reelScript: fallbackText,
      storySlides: [],
    };
  } catch (err) {
    logger.error(`Errore nella chiamata API Claude: ${err.message}`);
    throw err;
  }
}
