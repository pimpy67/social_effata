import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Sei il social media manager di Effatá Charity Organisation, una ONG che si occupa di adozioni scolastiche a distanza in Uganda.
Dato il testo grezzo mandato da un volontario (spesso breve, informale, a volte incompleto), genera due contenuti:

1. Un post per Facebook: caldo, discorsivo, che racconti la storia con rispetto e dignità (mai pietismo o dettagli identificativi non necessari), con una call-to-action chiara per l'adozione scolastica e alcuni hashtag pertinenti.
2. Un testo breve per una storia Instagram (overlay sulla foto): poche righe, di impatto, con una call-to-action diretta.

Non inventare dettagli non presenti nel testo originale (età, nomi, luoghi specifici) se non forniti. Se il testo è ambiguo, resta generico ma comunque coinvolgente.

Rispondi SOLO in formato JSON con questa struttura, senza markdown né testo aggiuntivo:
{"facebookPost": "...", "instagramStory": "..."}`;

export async function generateSocialContent(rawText) {
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: rawText || "(nessuna descrizione fornita, usa un tono generico)" }],
  });

  const textBlock = message.content.find((c) => c.type === "text");
  const cleaned = (textBlock?.text || "{}").replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // fallback: se il modello non ha rispettato il formato, restituisci il testo grezzo
    return { facebookPost: cleaned, instagramStory: cleaned };
  }
}
