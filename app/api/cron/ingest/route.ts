import { NextResponse } from "next/server";
import { isAuthorizedCron, config } from "@/lib/env";
import { listVideos, getVideoBuffer } from "@/lib/drive";
import { ensureHeader, getRows, appendRows } from "@/lib/sheets";
import { generateMetadata } from "@/lib/ai";
import { transcribeUrl } from "@/lib/transcribe";
import { uploadTempVideo, deleteTempVideo } from "@/lib/blob";
import { nextPublishDates, spDateString } from "@/lib/schedule";
import { formatDestinos } from "@/lib/destinos";

export const maxDuration = 60; // no plano Hobby, é ignorado — teto real é 10s
export const dynamic = "force-dynamic";

/**
 * INGESTÃO (1 vídeo por execução — cabe no teto de 10s do plano Hobby)
 *
 * Fluxo:
 *  1. Lista as pastas do Drive
 *  2. Pega o PRÓXIMO vídeo que ainda não está na planilha
 *  3. Se Groq configurado: baixa → sobe pro Blob → transcreve via URL
 *     (via URL escapa do limite de 25 MB da API da Groq)
 *  4. Gera metadados com nome + transcrição + destinos
 *  5. Salva na planilha guardando a blob_url — o publish reaproveita
 *     depois, evitando um novo download/upload
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

  // Descobre o próximo slot livre respeitando os já agendados
  const taken = new Set(
    rows
      .filter((r) => r.status !== "publicado" && r.dataAgendada)
      .map((r) => r.dataAgendada)
  );
  const [dataAgendada] = nextPublishDates(1, taken);
  const initialStatus = config.autoApprove() ? "aprovado" : "novo";

  // 1. Se Groq habilitado: baixa do Drive, sobe pro Blob, transcreve por URL.
  //    A blob_url é preservada na planilha e reaproveitada pelo publish.
  let transcript = "";
  let transcribeWarning = "";
  let blobUrl = "";

  if (config.hasGroq()) {
    try {
      const buffer = await getVideoBuffer(video.id);
      blobUrl = await uploadTempVideo(video.name, buffer);
      console.log(`[ingest] "${video.name}" ${buffer.length} bytes no Blob`);

      const result = await transcribeUrl(blobUrl, video.name);
      if (result.hasContent) {
        transcript = result.text;
        console.log(`[ingest] transcrição ok: ${result.text.length} chars`);
      } else {
        transcribeWarning = "sem transcrição: áudio sem fala detectável";
        console.log(`[ingest] transcript vazio para "${video.name}"`);
      }
    } catch (err) {
      transcribeWarning = `transcrição falhou: ${(err as Error).message}`;
      console.error(`[ingest] erro em "${video.name}":`, err);
      // Se subiu no Blob mas transcrição falhou, apaga pra não deixar órfão
      if (blobUrl) {
        await deleteTempVideo(blobUrl);
        blobUrl = "";
      }
    }
  }

  // 2. Geração de metadados
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
