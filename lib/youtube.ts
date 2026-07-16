import type { Readable } from "stream";
import { youtubeClient } from "./google";
import { config } from "./env";
import { channelConfig } from "@/channel.config";

export interface YouTubeUploadResult {
  videoId: string;
  url: string;
}

/**
 * Sobe um Short no YouTube.
 *
 * Observações importantes:
 * - Vídeos verticais curtos são classificados como Shorts automaticamente;
 *   incluir "#Shorts" na descrição reforça a classificação.
 * - Enquanto o projeto do Google Cloud não passar pela auditoria do YouTube,
 *   uploads via API ficam travados como PRIVADOS mesmo pedindo "public".
 *   Controle isso pela env YT_PRIVACY (veja README).
 * - A categoria vem de channel.config.ts.
 */
export async function uploadShort(
  stream: Readable,
  meta: {
    titulo: string;
    descricao: string;
    hashtags: string;
    tags: string;
  }
): Promise<YouTubeUploadResult> {
  const youtube = youtubeClient();

  const description = `${meta.descricao}\n\n${meta.hashtags} #Shorts`;
  const tags = meta.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 30);

  const res = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: meta.titulo,
        description,
        tags,
        categoryId: channelConfig.youtubeCategoryId,
        defaultLanguage: "pt-BR",
        defaultAudioLanguage: "pt-BR",
      },
      status: {
        privacyStatus: config.ytPrivacy(),
        selfDeclaredMadeForKids: false,
      },
    },
    media: { body: stream },
  });

  const videoId = res.data.id;
  if (!videoId) {
    throw new Error("Upload no YouTube não retornou um ID de vídeo.");
  }
  return { videoId, url: `https://youtube.com/shorts/${videoId}` };
}
