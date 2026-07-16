import { NextResponse } from "next/server";
import { isAuthorizedCron, config } from "@/lib/env";
import { getVideoStream, getVideoBuffer } from "@/lib/drive";
import { getRows, updateRow } from "@/lib/sheets";
import { uploadShort } from "@/lib/youtube";
import { publishInstagramReel, publishFacebookVideo } from "@/lib/meta";
import { uploadTempVideo, deleteTempVideo } from "@/lib/blob";
import { spDateString } from "@/lib/schedule";
import { parseDestinos } from "@/lib/destinos";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * PUBLICAÇÃO (roda seg/ter/qui/sex às 18h de São Paulo = 21h UTC)
 *
 * 1. Busca na planilha o próximo vídeo aprovado com data <= hoje
 * 2. Sobe no YouTube (Short)
 * 3. Sobe o arquivo temporariamente no Vercel Blob
 * 4. Publica o Reel no Instagram e o vídeo na Página do Facebook
 * 5. Apaga o arquivo temporário e marca "publicado" na planilha
 *
 * Cada plataforma é independente: se uma falhar, as outras não são desfeitas
 * e o erro fica registrado na coluna "erro" para você reprocessar.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const rows = await getRows();
  const today = spDateString();
  const publishable = config.autoApprove()
    ? new Set(["novo", "aprovado"])
    : new Set(["aprovado"]);

  const next = rows.find(
    (r) =>
      publishable.has(r.status) &&
      r.dataAgendada !== "" &&
      r.dataAgendada <= today &&
      r.titulo !== "" // sem título = ainda não revisado/preenchido
  );

  if (!next) {
    return NextResponse.json({
      ok: true,
      publicado: null,
      motivo: "Nenhum vídeo aprovado com data para hoje.",
    });
  }

  await updateRow(next.rowNumber, { status: "publicando" });

  // Destinos vindos da planilha (célula vazia = todos, retrocompat)
  const destinos = new Set(parseDestinos(next.destinos));

  const errors: string[] = [];
  const links: { youtube?: string; instagram?: string; facebook?: string } = {};
  const skipped: string[] = [];
  const caption = `${next.titulo}\n\n${next.descricao}\n\n${next.hashtags}`;

  // Retry inteligente: plataformas com coluna já preenchida são puladas
  // (sem repostagem). Plataformas fora dos destinos também são puladas.

  // --- 1. YouTube ---
  if (!destinos.has("youtube")) {
    skipped.push("youtube");
  } else if (next.youtube) {
    links.youtube = next.youtube; // já publicado numa tentativa anterior
  } else {
    try {
      const stream = await getVideoStream(next.fileId);
      const yt = await uploadShort(stream, {
        titulo: next.titulo,
        descricao: next.descricao,
        hashtags: next.hashtags,
        tags: next.tags,
      });
      links.youtube = yt.url;
      await updateRow(next.rowNumber, { youtube: yt.url });
    } catch (err) {
      errors.push(`YouTube: ${(err as Error).message}`);
    }
  }

  // --- 2. Meta (precisa de URL pública → Vercel Blob) ---
  const needsIg = destinos.has("instagram") && !next.instagram;
  const needsFb = destinos.has("facebook") && !next.facebook;
  if (!destinos.has("instagram")) skipped.push("instagram");
  if (!destinos.has("facebook")) skipped.push("facebook");
  if (next.instagram) links.instagram = next.instagram;
  if (next.facebook) links.facebook = next.facebook;

  // Reusa a blob_url gravada pelo ingest (se existir) — economiza um ciclo
  // completo de download-do-Drive + upload-para-o-Blob no publish.
  let blobUrl: string | null = next.blobUrl || null;
  let blobUploadedHere = false;

  if ((needsIg || needsFb) && !blobUrl) {
    try {
      const buffer = await getVideoBuffer(next.fileId);
      blobUrl = await uploadTempVideo(next.arquivo, buffer);
      blobUploadedHere = true;
      await updateRow(next.rowNumber, { blob_url: blobUrl });
    } catch (err) {
      errors.push(`Blob: ${(err as Error).message}`);
    }
  }

  if (blobUrl) {
    if (needsIg) {
      try {
        const ig = await publishInstagramReel(blobUrl, caption);
        links.instagram = ig.mediaId;
        await updateRow(next.rowNumber, { instagram: ig.mediaId });
      } catch (err) {
        errors.push(`Instagram: ${(err as Error).message}`);
      }
    }

    if (needsFb) {
      try {
        const fb = await publishFacebookVideo(
          blobUrl,
          next.titulo,
          `${next.descricao}\n\n${next.hashtags}`
        );
        links.facebook = fb.videoId;
        await updateRow(next.rowNumber, { facebook: fb.videoId });
      } catch (err) {
        errors.push(`Facebook: ${(err as Error).message}`);
      }
    }
  }

  // Limpeza: se tudo que precisava do Blob foi publicado (ou não precisava),
  // apaga do Blob e limpa a coluna. Se algo do Meta falhou, guarda pra retry.
  const metaCompleta =
    (!destinos.has("instagram") || links.instagram) &&
    (!destinos.has("facebook") || links.facebook);

  if (blobUrl && metaCompleta) {
    await deleteTempVideo(blobUrl);
    await updateRow(next.rowNumber, { blob_url: "" });
  } else if (blobUrl && blobUploadedHere) {
    // Se subimos agora mas Meta falhou parcialmente, guarda pra retry usar
    await updateRow(next.rowNumber, { blob_url: blobUrl });
  }

  const finalStatus = errors.length === 0 ? "publicado" : "erro";
  await updateRow(next.rowNumber, {
    status: finalStatus,
    erro: errors.join(" | "),
  });

  return NextResponse.json({
    ok: errors.length === 0,
    publicado: next.arquivo,
    destinos: [...destinos],
    links,
    ignorados: skipped,
    blob_reusado: !blobUploadedHere && !!next.blobUrl,
    erros: errors,
  });
}
