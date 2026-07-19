import { config } from "./env";

/**
 * Publicação no TikTok via Content Posting API.
 *
 * IMPORTANTE — por que FILE_UPLOAD e não PULL_FROM_URL (diferente do
 * Instagram/Facebook, que usam URL do Vercel Blob):
 * o modo PULL_FROM_URL exige que o domínio da URL seja VERIFICADO no
 * TikTok for Developers (registro DNS ou arquivo de verificação, provando
 * posse do domínio). O domínio do Vercel Blob
 * (*.public.blob.vercel-storage.com) pertence à Vercel, não a você — não
 * tem como verificar posse dele. Por isso aqui o pipeline baixa o vídeo do
 * Drive e envia os bytes DIRETO pro TikTok (FILE_UPLOAD), sem precisar de
 * nenhuma URL pública intermediária.
 *
 * Enquanto o app não passar pela auditoria da TikTok, toda publicação sai
 * forçosamente como SELF_ONLY (só você vê) — não há como pedir "público"
 * nesse meio tempo, é travado pela própria TikTok. Ver TIKTOK_PRIVACY.
 */

interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

async function refreshAccessToken(): Promise<RefreshResult> {
  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: new URLSearchParams({
      client_key: config.tiktok.clientKey(),
      client_secret: config.tiktok.clientSecret(),
      grant_type: "refresh_token",
      refresh_token: config.tiktok.refreshToken(),
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Falha ao renovar token: ${JSON.stringify(data).slice(0, 300)}`);
  }

  // A TikTok pode devolver um refresh_token novo a cada renovação (rotação).
  // Como não dá pra reescrever variáveis de ambiente de dentro da função,
  // só avisamos nos logs — se a próxima publicação falhar com token
  // inválido, é sinal de atualizar TIKTOK_REFRESH_TOKEN na Vercel.
  if (data.refresh_token && data.refresh_token !== config.tiktok.refreshToken()) {
    console.warn(
      `[tiktok] A TikTok retornou um refresh_token novo. Se a próxima ` +
        `publicação falhar com erro de autenticação, atualize ` +
        `TIKTOK_REFRESH_TOKEN na Vercel para: ${data.refresh_token}`
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? config.tiktok.refreshToken(),
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export interface TikTokPublishResult {
  publishId: string;
}

/**
 * Publica um vídeo no TikTok a partir de um buffer (baixado do Drive).
 * Usa FILE_UPLOAD em chunk único — Shorts cabem tranquilamente dentro do
 * limite de um único chunk (a TikTok processa até centenas de MB por chunk).
 */
export async function publishToTikTok(
  videoBuffer: Buffer,
  caption: string
): Promise<TikTokPublishResult> {
  const { accessToken } = await refreshAccessToken();

  // 1. Inicializa o post
  const initRes = await fetch(
    "https://open.tiktokapis.com/v2/post/publish/video/init/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: caption.slice(0, 2200),
          privacy_level: config.tiktok.privacy(),
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: "FILE_UPLOAD",
          video_size: videoBuffer.length,
          chunk_size: videoBuffer.length,
          total_chunk_count: 1,
        },
      }),
    }
  );

  const initData = await initRes.json();
  if (!initRes.ok || initData.error?.code !== "ok") {
    throw new Error(`Init falhou: ${JSON.stringify(initData).slice(0, 300)}`);
  }

  const publishId: string = initData.data.publish_id;
  const uploadUrl: string = initData.data.upload_url;

  // 2. Envia os bytes do vídeo direto pro upload_url retornado
  const bytes = new Uint8Array(videoBuffer.byteLength);
  bytes.set(videoBuffer);

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Range": `bytes 0-${videoBuffer.length - 1}/${videoBuffer.length}`,
    },
    body: bytes,
  });

  if (!uploadRes.ok) {
    const detail = await uploadRes.text();
    throw new Error(`Upload falhou: HTTP ${uploadRes.status} ${detail.slice(0, 200)}`);
  }

  // 3. Aguarda o processamento (poll)
  const deadline = Date.now() + 4 * 60 * 1000; // até 4 minutos
  let status = "PROCESSING_UPLOAD";
  while (status !== "PUBLISH_COMPLETE") {
    if (Date.now() > deadline) {
      throw new Error("Timeout aguardando processamento do TikTok (4 min).");
    }
    await sleep(6000);

    const statusRes = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ publish_id: publishId }),
      }
    );
    const statusData = await statusRes.json();
    status = statusData.data?.status;

    if (status === "FAILED") {
      throw new Error(
        `Publicação falhou: ${statusData.data?.fail_reason ?? "motivo desconhecido"}`
      );
    }
  }

  return { publishId };
}
