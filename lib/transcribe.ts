import { config } from "./env";

/**
 * Transcrição de áudio via Groq (Whisper Large v3 Turbo).
 *
 * Estratégia: passamos uma URL pública em vez de fazer upload direto.
 * Isso contorna o limite de 25 MB da API (que se aplica só ao upload
 * multipart). Via URL, o limite passa a ser 25 MINUTOS de áudio — Shorts
 * e Reels ficam bem abaixo disso.
 *
 * Preço: ~US$ 0,04/hora de áudio, com free tier de 2000 requests/dia.
 * A API aceita MP4 direto: extrai áudio internamente e downsampleia para
 * 16kHz mono. Sem FFmpeg no build.
 */

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = "whisper-large-v3-turbo";

export interface TranscribeResult {
  text: string;
  /** true = temos texto útil pra dar à IA; false = usar só o nome do arquivo. */
  hasContent: boolean;
}

/**
 * Transcreve um vídeo a partir de uma URL pública (Vercel Blob).
 * Nunca lança: falha vira `{ text: "", hasContent: false }` + log —
 * o ingest segue funcionando com qualidade degradada.
 */
export async function transcribeUrl(
  publicUrl: string,
  fileName: string
): Promise<TranscribeResult> {
  try {
    const form = new FormData();
    form.append("url", publicUrl);
    form.append("model", MODEL);
    form.append("language", "pt");        // dica pro modelo: PT-BR
    form.append("response_format", "text"); // resposta em texto puro

    const res = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.groqKey()}` },
      body: form,
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`HTTP ${res.status}: ${detail.slice(0, 200)}`);
    }

    // response_format=text → o corpo é o próprio transcript
    const text = (await res.text()).trim();
    // Menos de 8 caracteres = provavelmente ruído/silêncio, não vale usar
    return { text, hasContent: text.length >= 8 };
  } catch (err) {
    console.warn(
      `[transcribe] Falha ao transcrever "${fileName}": ${(err as Error).message}`
    );
    return { text: "", hasContent: false };
  }
}
