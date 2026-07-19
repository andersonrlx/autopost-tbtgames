import { NextResponse } from "next/server";
import { isAuthorizedCron, config } from "@/lib/env";
import { getVideoStream, getVideoBuffer } from "@/lib/drive";
import { getRows, updateRow } from "@/lib/sheets";
import { uploadShort } from "@/lib/youtube";
import { publishInstagramReel, publishFacebookVideo } from "@/lib/meta";
import { publishToTikTok } from "@/lib/tiktok";
import { uploadTempVideo, deleteTempVideo } from "@/lib/blob";
import { spDateString } from "@/lib/schedule";
import { parseDestinos } from "@/lib/destinos";
import { notifyPublished } from "@/lib/sms";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * PUBLICAÇÃO (cron roda 2x por dia — 12h e 18h de São Paulo — mas só publica
 * se houver vídeo aprovado com data_agendada <= hoje. O agendamento em si
 * continua só em seg/ter/qui/sex, definido em lib/schedule.ts; os dois
 * horários diários servem para permitir publicar esporadicamente ao meio-dia
 * quando você aprovar/agendar uma linha pra isso na planilha.
 *
 * Cada disparo processa NO MÁXIMO 1 vídeo (o primeiro aprovado+vencido que
 * encontrar, na ordem da planilha). Se só 1 vídeo estiver aprovado num dia,
 * o disparo que rodar primeiro (meio-dia ou 18h) publica ele; o outro
 * disparo não encontra nada e não faz nada — sem risco de duplicar.
 * Se você aprovar 2 vídeos pro mesmo dia, o disparo de meio-dia publica o
 * primeiro da planilha e o de 18h publica o segundo.)
 *
 * 1. Busca na planilha o próximo vídeo aprovado com data <= hoje
 * 2. Sobe no YouTube (Short)
 * 3. Sobe o arquivo temporariamente no Vercel Blob (para Instagram/Facebook)
 * 4. Publica o Reel no Instagram e o vídeo na Página do Facebook
 * 5. Publica no TikTok (upload direto, sem depender do Blob — ver lib/tiktok.ts).
 *    Enquanto o app não passar pela auditoria da TikTok, sai sempre como
 *    SELF_ONLY (só você vê) — ver TIKTOK_PRIVACY no README.
 * 6. Apaga o arquivo temporário do Blob e marca "publicado" na planilha
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
  const links: { youtube?: string; instagram?: string; facebook?: string; tiktok?: string } = {};
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

  // --- 3. TikTok (FILE_UPLOAD direto do buffer — não usa Blob nem URL
  // pública, ver lib/tiktok.ts sobre por quê). Baixa seu próprio buffer,
  // independente do fluxo de Blob usado pelo Instagram/Facebook — mais
  // simples do que acoplar ao ciclo de vida do Blob, ao custo de um
  // download a mais do Drive quando os dois grupos de destino coexistem
  // (Shorts são pequenos, o custo é desprezível).
  const needsTk = destinos.has("tiktok") && !next.tiktok;
  if (!destinos.has("tiktok")) skipped.push("tiktok");
  if (next.tiktok) links.tiktok = next.tiktok;

  if (needsTk) {
    try {
      const buffer = await getVideoBuffer(next.fileId);
      const tk = await publishToTikTok(buffer, caption);
      links.tiktok = tk.publishId;
      await updateRow(next.rowNumber, { tiktok: tk.publishId });
    } catch (err) {
      errors.push(`TikTok: ${(err as Error).message}`);
    }
  }

  const finalStatus = errors.length === 0 ? "publicado" : "erro";
  await updateRow(next.rowNumber, {
    status: finalStatus,
    erro: errors.join(" | "),
  });

  const publicadas = Object.keys(links).filter(
    (k) => !skipped.includes(k)
  );
  await notifyPublished({
    titulo: next.titulo,
    publicadas,
    ignoradas: skipped,
    erros: errors,
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
