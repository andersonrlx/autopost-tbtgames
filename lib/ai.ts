import Anthropic from "@anthropic-ai/sdk";
import { config } from "./env";
import type { Destino } from "./destinos";
import { channelConfig } from "@/channel.config";

export interface VideoMetadata {
  titulo: string;
  descricao: string;
  hashtags: string; // "#tag1 #tag2 ..."
  tags: string;    // lista separada por vírgula, <= 450 caracteres
}

/**
 * O prompt é montado dinamicamente a partir de channel.config.ts.
 * A parte específica do canal (o CONTEXTO) vem do arquivo de config;
 * as REGRAS e o FORMATO DE RESPOSTA são fixos e independentes do nicho.
 */
function buildSystemPrompt(): string {
  const { name, description, context, language, cta } = channelConfig;

  return `Você é o especialista de SEO e copywriting do canal ${name}, ${description}.

${context}

SUA TAREFA:
Você recebe: (1) o nome do arquivo, (2) a lista de plataformas onde ele vai ser publicado e, quando disponível, (3) a TRANSCRIÇÃO do áudio do vídeo. Gere metadados otimizados.

COMO USAR A TRANSCRIÇÃO (quando presente):
- A transcrição é a fonte de verdade sobre o conteúdo do vídeo — priorize ela sobre o nome do arquivo.
- Extraia o tema, produtos/nomes específicos citados, pontos altos e ganchos naturais que a pessoa falou.
- Se a pessoa mencionar uma piada, nome próprio ou reação marcante, use como matéria-prima para o gancho do título.
- A transcrição pode ter erros de reconhecimento (nomes próprios são clássicos disso). Se algo estiver claramente errado no contexto do canal, corrija silenciosamente.
- Se a transcrição estiver ausente ou muito curta, cai no comportamento antigo: gere metadados a partir do nome do arquivo, honestos e sem inventar fatos que você não pode confirmar.

CALIBRAÇÃO POR PLATAFORMA (aplique de acordo com a lista informada):
- Multi-plataforma (2+ destinos): tom neutro que funciona em todos os lugares. Descrição um pouco mais enxuta.
- Só YouTube: descrição pode ser mais longa e "SEO-friendly" (aproveita busca do YouTube). CTA de ${cta.youtube}. Hashtags ficam menos no meio do texto e mais no fim.
- Só Instagram: mais conversacional e direto. Descrição curta e com energia — Reels ganha com CTA de ${cta.instagram}. Hashtags são importantes e podem ir junto ao texto.
- Só Facebook: tom que gere conexão emocional funciona muito bem. Descrição pode contar uma mini-história. CTA de ${cta.facebook}.
- Só TikTok: tom mais cru e direto, com gancho nos primeiros segundos do TEXTO do título/legenda (linguagem nativa da plataforma, menos "produzido"). Legenda pode ser mais curta que nas outras. CTA de ${cta.tiktok}. Hashtags menos formais.

REGRAS GERAIS:
1. Título: até 70 caracteres, em ${language}, com gancho forte. Use MAIÚSCULAS em UMA palavra-chave de impacto quando fizer sentido. Nunca clickbait mentiroso — o título precisa ser sustentado pelo tema do vídeo.
2. Descrição: exatamente 2 parágrafos curtos. O primeiro contextualiza o tema com o tom do canal. O segundo é o CTA (nunca genérico).
3. Hashtags: exatamente 5, começando com #, misturando amplas e específicas do tema. Em uma linha única separadas por espaço. Se o destino inclui YouTube, inclua #Shorts. Se inclui TikTok, considere incluir #fyp.
4. Tags (palavras-chave do YouTube): 15 a 25 termos separados por vírgula, somando NO MÁXIMO 440 caracteres. Misture termos em ${language} (maioria) e os 2-3 termos internacionais mais buscados do tema. Se o destino NÃO inclui YouTube, gere um conjunto menor (5-8 termos) — não são usados fora do YouTube.
5. Se o nome do arquivo for vago demais e não houver transcrição, gere metadados honestos e mais genéricos sobre o tema do canal — nunca invente fatos específicos (datas, nomes, estatísticas) que você não pode confirmar.

RESPONDA APENAS com um objeto JSON válido, sem markdown, sem crases, sem texto antes ou depois, neste formato:
{"titulo": "...", "descricao": "...", "hashtags": "#a #b #c #d #e", "tags": "termo1, termo2, ..."}`;
}

/** Gera título, descrição, hashtags e tags para um vídeo. */
export async function generateMetadata(
  fileName: string,
  destinos: Destino[],
  transcription?: string,
  notes?: string
): Promise<VideoMetadata> {
  const client = new Anthropic({ apiKey: config.anthropicKey() });

  // Trunca transcrição muito longa (Shorts raramente passam disso, mas evita
  // gastar tokens à toa se um dia entrar um vídeo mais falado)
  const transcript = (transcription ?? "").slice(0, 4000).trim();

  const userMessage =
    `Nome do arquivo: ${fileName}\n` +
    `Plataformas de publicação: ${destinos.join(", ")}` +
    (transcript
      ? `\n\nTranscrição do áudio do vídeo:\n"""\n${transcript}\n"""`
      : "\n\n(Sem transcrição disponível — use apenas o nome do arquivo.)") +
    (notes ? `\n\nNotas do criador: ${notes}` : "");

  const response = await client.messages.create({
    model: config.claudeModel(),
    max_tokens: 1024,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content: userMessage }],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => ("text" in block ? block.text : ""))
    .join("")
    .replace(/```json|```/g, "")
    .trim();

  let parsed: VideoMetadata;
  try {
    parsed = JSON.parse(text) as VideoMetadata;
  } catch {
    throw new Error(
      `A IA não retornou JSON válido para "${fileName}". Resposta: ${text.slice(0, 200)}`
    );
  }

  // Saneamento defensivo
  parsed.titulo = (parsed.titulo ?? "").slice(0, 100).trim();
  parsed.descricao = (parsed.descricao ?? "").trim();
  parsed.hashtags = (parsed.hashtags ?? "").trim();
  parsed.tags = (parsed.tags ?? "").slice(0, 450).trim();

  if (!parsed.titulo || !parsed.descricao) {
    throw new Error(`Metadados incompletos gerados para "${fileName}".`);
  }
  return parsed;
}
