import { config } from "./env";

/**
 * Transcrição de áudio via Groq (Whisper Large v3 Turbo).
 *
 * Estratégia: extraímos só a faixa de ÁUDIO do vídeo (via lib/audio.ts,
 * com FFmpeg) antes de mandar pra Groq. O motivo: a Groq aplica um limite
 * de 25 MB no arquivo final, e isso vale tanto para upload direto quanto
 * para o parâmetro `url` — ela baixa e mede o arquivo do mesmo jeito.
 * Um vídeo de Short pesa 30-50 MB; o ÁUDIO do mesmo vídeo, comprimido em
 * MP3 mono 64kbps, pesa algumas centenas de KB. Extrair o áudio primeiro
 * resolve o limite pela raiz, em vez de tentar contorná-lo.
 *
 * Preço: ~US$ 0,04/hora de áudio, com free tier de 2000 requests/dia.
 */

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = "whisper-large-v3-turbo";

export interface TranscribeResult {
  text: string;
  /** true = temos texto útil pra dar à IA; false = usar só o nome do arquivo. */
  hasContent: boolean;
}

/**
 * Transcreve a partir de um buffer de ÁUDIO já extraído (MP3 pequeno).
 * Como o áudio de um Short pesa KB (não MB), o upload multipart direto
 * cabe tranquilamente no limite de 25 MB da Groq — sem precisar de URL
 * pública nem do Vercel Blob para esta etapa.
 */
export async function transcribeAudioBuffer(
  audioBuffer: Buffer,
  fileName: string
): Promise<TranscribeResult> {
  try {
    const form = new FormData();
    const bytes = new Uint8Array(audioBuffer.byteLength);
    bytes.set(audioBuffer);
    form.append("file", new Blob([bytes]), `${fileName}.mp3`);
    form.append("model", MODEL);
    form.append("language", "pt");
    form.append("response_format", "text");

    const res = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.groqKey()}` },
      body: form,
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`HTTP ${res.status}: ${detail.slice(0, 200)}`);
    }

    const text = (await res.text()).trim();
    return { text, hasContent: text.length >= 8 };
  } catch (err) {
    console.warn(
      `[transcribe] Falha ao transcrever "${fileName}": ${(err as Error).message}`
    );
    return { text: "", hasContent: false };
  }
}

/**
 * Transcreve a partir de uma URL pública (mantido para compatibilidade /
 * casos onde você já tem uma URL de áudio pronta). Atenção: a Groq aplica
 * o limite de 25 MB no arquivo FINAL mesmo via URL — isto NÃO ajuda com
 * vídeos grandes; use `transcribeAudioBuffer` com áudio pré-extraído.
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
