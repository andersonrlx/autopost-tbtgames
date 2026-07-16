import { config } from "./env";

const GRAPH = "https://graph.facebook.com/v21.0";

interface GraphError {
  error?: { message?: string; code?: number };
}

async function graphFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T & GraphError> {
  const res = await fetch(`${GRAPH}${path}`, init);
  const data = (await res.json()) as T & GraphError;
  if (!res.ok || data.error) {
    throw new Error(
      `Graph API (${path}): ${data.error?.message ?? `HTTP ${res.status}`}`
    );
  }
  return data;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Publica um Reel no Instagram.
 * A Graph API não aceita upload de arquivo: ela PUXA o vídeo de uma URL
 * pública (por isso o pipeline sobe o vídeo temporariamente no Vercel Blob).
 * Fluxo: cria container → aguarda processamento → publica.
 */
export async function publishInstagramReel(
  videoUrl: string,
  caption: string
): Promise<{ mediaId: string }> {
  const token = config.meta.pageToken();
  const igUser = config.meta.igUserId();

  // 1. Cria o container do Reel
  const container = await graphFetch<{ id: string }>(`/${igUser}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "REELS",
      video_url: videoUrl,
      caption,
      share_to_feed: true,
      access_token: token,
    }),
  });

  // 2. Aguarda a Meta processar o vídeo (poll de status)
  const deadline = Date.now() + 4 * 60 * 1000; // até 4 minutos
  let status = "IN_PROGRESS";
  while (status !== "FINISHED") {
    if (Date.now() > deadline) {
      throw new Error(
        "Instagram: o processamento do Reel não terminou a tempo (timeout de 4 min)."
      );
    }
    await sleep(8000);
    const check = await graphFetch<{ status_code: string }>(
      `/${container.id}?fields=status_code&access_token=${token}`
    );
    status = check.status_code;
    if (status === "ERROR") {
      throw new Error("Instagram: a Meta retornou erro ao processar o vídeo.");
    }
  }

  // 3. Publica o container processado
  const published = await graphFetch<{ id: string }>(
    `/${igUser}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: container.id, access_token: token }),
    }
  );

  return { mediaId: published.id };
}

/**
 * Publica um vídeo na Página do Facebook.
 * Também via URL pública (file_url) — a Meta baixa o arquivo.
 */
export async function publishFacebookVideo(
  videoUrl: string,
  title: string,
  description: string
): Promise<{ videoId: string }> {
  const token = config.meta.pageToken();
  const pageId = config.meta.pageId();

  const data = await graphFetch<{ id: string }>(`/${pageId}/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file_url: videoUrl,
      title,
      description,
      access_token: token,
    }),
  });

  return { videoId: data.id };
}
