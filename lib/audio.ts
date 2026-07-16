import { spawnSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync, chmodSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

/**
 * Extrai a faixa de áudio de um vídeo, comprimida como MP3 mono 64kbps.
 *
 * Por quê: a API da Groq tem um teto de 25 MB — e isso vale tanto para
 * upload direto quanto para o parâmetro `url` (ela baixa e aplica o mesmo
 * limite no arquivo final). Um Short de 40-50 MB (vídeo completo) nunca
 * passaria; o ÁUDIO sozinho do mesmo vídeo fica na casa de KB.
 *
 * Como: usa @ffmpeg-installer/ffmpeg, que empacota um binário estático do
 * FFmpeg por plataforma. Na Vercel (runtime Node.js, não Edge), esse
 * binário roda normalmente dentro da função serverless — é a mesma
 * abordagem usada por várias ferramentas de processamento de mídia
 * hospedadas na Vercel.
 *
 * Falha aqui não deve derrubar a ingestão: se a extração não funcionar
 * neste ambiente (raro, mas pode acontecer por permissão do binário),
 * o chamador cai no fallback de "sem transcrição, usa nome do arquivo".
 */
export async function extractAudio(videoBuffer: Buffer): Promise<Buffer> {
  const id = Math.random().toString(36).slice(2);
  const videoPath = join(tmpdir(), `in-${id}.mp4`);
  const audioPath = join(tmpdir(), `out-${id}.mp3`);

  try {
    writeFileSync(videoPath, videoBuffer);

    // Em alguns ambientes serverless as permissões de execução do binário
    // empacotado não sobrevivem ao deploy — força +x por garantia.
    try {
      chmodSync(ffmpegInstaller.path, 0o755);
    } catch {
      // Se não conseguir (ex: filesystem read-only fora do /tmp), segue —
      // o binário já pode vir executável.
    }

    const args = [
      "-y", // sobrescreve sem perguntar
      "-i", videoPath,
      "-vn", // descarta vídeo, só extrai áudio
      "-acodec", "libmp3lame",
      "-ar", "16000", // 16kHz — o que o Whisper usa internamente mesmo
      "-ac", "1", // mono
      "-b:a", "64k",
      audioPath,
    ];

    const result = spawnSync(ffmpegInstaller.path, args, {
      timeout: 8000, // margem de segurança dentro do teto de 10s da função
    });

    if (result.status !== 0) {
      const stderr = result.stderr?.toString().slice(-500) ?? "sem detalhes";
      throw new Error(`ffmpeg saiu com código ${result.status}: ${stderr}`);
    }

    return readFileSync(audioPath);
  } finally {
    // Limpeza best-effort — /tmp é efêmero entre execuções de qualquer forma,
    // mas evita acumular lixo dentro de uma mesma invocação longa.
    try { unlinkSync(videoPath); } catch {}
    try { unlinkSync(audioPath); } catch {}
  }
}
