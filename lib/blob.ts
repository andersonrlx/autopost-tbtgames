import { put, del } from "@vercel/blob";

/**
 * Sobe o vídeo temporariamente no Vercel Blob e retorna a URL pública.
 * A Meta (Instagram/Facebook) baixa o arquivo dessa URL; depois de publicar
 * nas duas plataformas, o arquivo é apagado com `deleteTempVideo`.
 */
export async function uploadTempVideo(
  fileName: string,
  data: Buffer
): Promise<string> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const blob = await put(`temp-publish/${Date.now()}-${safeName}`, data, {
    access: "public",
    contentType: "video/mp4",
  });
  return blob.url;
}

export async function deleteTempVideo(url: string): Promise<void> {
  try {
    await del(url);
  } catch {
    // Não é crítico: o blob pode ser limpo manualmente depois.
    console.warn(`Não consegui apagar o blob temporário: ${url}`);
  }
}
