import { NextResponse } from "next/server";
import { isAuthorizedCron, config } from "@/lib/env";
import { listVideos, getVideoBuffer } from "@/lib/drive";
import { ensureHeader, getRows, appendRows } from "@/lib/sheets";
import { generateMetadata } from "@/lib/ai";
import { extractAudio } from "@/lib/audio";
import { transcribeAudioBuffer } from "@/lib/transcribe";
import { uploadTempVideo } from "@/lib/blob";
import { nextPublishDates, spDateString } from "@/lib/schedule";
import { formatDestinos, parseDestinos } from "@/lib/destinos";
import { notifyScheduled, notifyScheduleFailed } from "@/lib/sms";

export const maxDuration = 60; // no plano Hobby, é ignorado — teto real é 10s
export const dynamic = "force-dynamic";

/**
 * INGESTÃO (1 vídeo por execução — cabe no teto de 10s do plano Hobby)
 *
 * Fluxo:
 *  1. Lista as pastas do Drive
 *  2. Pega o PRÓXIMO vídeo que ainda não está na planilha
 *  3. Se precisar do buffer (Groq ligado, ou destino inclui IG/FB), baixa 1x
 *  4. Se Groq configurado: extrai só o ÁUDIO (via FFmpeg) e transcreve.
 *     Extrair o áudio evita o limite de 25 MB da Groq — o vídeo inteiro
 *     de um Short passa fácil desse teto, o áudio sozinho não chega perto
 *     (a Groq aplica o limite no arquivo final tanto em upload quanto via
 *     URL, então a única saída real é mandar um arquivo menor).
 *  5. Se o destino inclui Instagram/Facebook: sobe o VÍDEO pro Blob, para
 *     o publish reaproveitar depois (YouTube usa stream direto do Drive,
 *     não precisa de Blob).
 *  6. Gera metadados com nome + transcrição + destinos, salva na planilha
 *
 * Batch upload (encher a fila de uma vez):
 *   for i in {1..30}; do
 *     curl -H "Authorization: Bearer $CRON_SECRET" \
 *       https://SEU-PROJETO.vercel.app/api/cron/ingest
 *     sleep 2
 *   done
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  await ensureHeader();

  const [driveVideos, rows] = await Promise.all([listVideos(), getRows()]);

  const knownIds = new Set(rows.map((r) => r.fileId));
  const pending = driveVideos.filter((v) => !knownIds.has(v.id));

  if (pending.length === 0) {
    return NextResponse.json({ ok: true, processado: null, restantes: 0 });
  }

  // Pega SÓ o primeiro vídeo — a ordem já veio cronológica de listVideos()
  const video = pending[0];
  const destinos = formatDestinos(video.destinosPadrao);
  const destinosSet = new Set(parseDestinos(destinos));

  // Descobre o próximo slot livre respeitando os já agendados
  const taken = new Set(
    rows
      .filter((r) => r.status !== "publicado" && r.dataAgendada)
      .map((r) => r.dataAgendada)
  );
  const [dataAgendada] = nextPublishDates(1, taken);
  const initialStatus = config.autoApprove() ? "aprovado" : "novo";

  const needsMetaBlob = destinosSet.has("instagram") || destinosSet.has("facebook");
  const needsBuffer = config.hasGroq() || needsMetaBlob;

  let transcript = "";
  let transcribeWarning = "";
  let blobUrl = "";

  if (needsBuffer) {
    try {
      const buffer = await getVideoBuffer(video.id);
      console.log(`[ingest] "${video.name}" baixado: ${buffer.length} bytes`);

      // Transcrição: extrai só o áudio (pequeno) e sobe direto pra Groq
      if (config.hasGroq()) {
        try {
          const audio = await extractAudio(buffer);
          console.log(`[ingest] áudio extraído: ${audio.length} bytes`);
          const result = await transcribeAudioBuffer(audio, video.name);
          if (result.hasContent) {
            transcript = result.text;
            console.log(`[ingest] transcrição ok: ${result.text.length} chars`);
          } else {
            transcribeWarning = "sem transcrição: áudio sem fala detectável";
          }
        } catch (err) {
          transcribeWarning = `transcrição falhou: ${(err as Error).message}`;
          console.error(`[ingest] erro na transcrição de "${video.name}":`, err);
        }
      }

      // Vídeo completo no Blob, só se o destino realmente precisar (Meta)
      if (needsMetaBlob) {
        blobUrl = await uploadTempVideo(video.name, buffer);
        console.log(`[ingest] vídeo no Blob para reuso posterior`);
      }
    } catch (err) {
      console.error(`[ingest] erro ao baixar "${video.name}":`, err);
      transcribeWarning = transcribeWarning || `download falhou: ${(err as Error).message}`;
    }
  }

  // Geração de metadados
  let row: string[];
  let ok = true;
  let erro: string | undefined;
  try {
    const meta = await generateMetadata(video.name, video.destinosPadrao, transcript);
    row = [
      video.id,
      video.name,
      meta.titulo,
      meta.descricao,
      meta.hashtags,
      meta.tags,
      initialStatus,
      dataAgendada,
      "", "", "", // youtube, instagram, facebook
      transcribeWarning, // aviso não-bloqueante fica na coluna erro
      spDateString(),
      destinos,
      blobUrl,
    ];
  } catch (err) {
    ok = false;
    erro = (err as Error).message;
    const msg = `Falha na geração de metadados: ${erro}`;
    row = [
      video.id,
      video.name,
      "", "", "", "",
      "novo",
      dataAgendada,
      "", "", "",
      transcribeWarning ? `${msg} | ${transcribeWarning}` : msg,
      spDateString(),
      destinos,
      blobUrl,
    ];
  }

  await appendRows([row]);

  if (ok) {
    await notifyScheduled({
      titulo: row[2],
      arquivo: video.name,
      dataAgendada,
      destinos,
    });
  } else {
    await notifyScheduleFailed({ arquivo: video.name, erro: erro ?? "" });
  }

  return NextResponse.json({
    ok,
    processado: video.name,
    destinos,
    data_agendada: dataAgendada,
    transcricao: transcript ? `${transcript.length} chars` : "não",
    restantes: pending.length - 1,
    erro,
  });
}
