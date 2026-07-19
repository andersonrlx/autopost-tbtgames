import type { Readable } from "stream";
import { driveClient } from "./google";
import { config } from "./env";
import { TODOS_DESTINOS, DESTINOS_CONHECIDOS, type Destino } from "./destinos";

export interface DriveVideo {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdTime: string;
  /** Destinos padrão inferidos pela pasta de origem. */
  destinosPadrao: Destino[];
}

/** Lista os vídeos de UMA pasta específica do Drive. */
async function listFolder(folderId: string): Promise<Omit<DriveVideo, "destinosPadrao">[]> {
  if (!folderId) return [];
  const drive = driveClient();
  const videos: Omit<DriveVideo, "destinosPadrao">[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType contains 'video/' and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, size, createdTime)",
      orderBy: "createdTime",
      pageSize: 100,
      pageToken,
    });

    for (const f of res.data.files ?? []) {
      if (f.id && f.name) {
        videos.push({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType ?? "video/mp4",
          size: Number(f.size ?? 0),
          createdTime: f.createdTime ?? "",
        });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return videos;
}

/**
 * Lista todos os vídeos das 5 pastas monitoradas (Todas, YT, IG, FB, TikTok),
 * etiquetando cada um com seus destinos padrão, e ordenando por createdTime.
 *
 * Ordem cronológica única: quem foi criado no Drive primeiro entra na fila
 * primeiro, independente da pasta. Isso preserva o ritmo seg/ter/qui/sex.
 *
 * Se o mesmo file_id aparecer em duas pastas (raro, mas possível se você
 * mover arquivo entre elas), vence a versão mais permissiva de destinos.
 *
 * O TikTok NÃO entra automaticamente pela pasta "Todas" — só pela pasta
 * dedicada "Só TikTok" ou editando a coluna `destinos` na planilha. Ver
 * o comentário em destinos.ts sobre por quê.
 */
export async function listVideos(): Promise<DriveVideo[]> {
  const folders: { id: string; destinos: Destino[] }[] = [
    { id: config.driveFolderId(), destinos: [...TODOS_DESTINOS] },
    { id: config.driveFolderYoutube(), destinos: ["youtube" as Destino] },
    { id: config.driveFolderInstagram(), destinos: ["instagram" as Destino] },
    { id: config.driveFolderFacebook(), destinos: ["facebook" as Destino] },
    { id: config.driveFolderTiktok(), destinos: ["tiktok" as Destino] },
  ].filter((f) => f.id !== "");

  const results = await Promise.all(folders.map((f) => listFolder(f.id)));

  const map = new Map<string, DriveVideo>();
  for (let i = 0; i < folders.length; i++) {
    for (const v of results[i]) {
      const existing = map.get(v.id);
      if (existing) {
        // Duplicata: união dos destinos (mais permissivo vence)
        const merged = new Set([...existing.destinosPadrao, ...folders[i].destinos]);
        existing.destinosPadrao = DESTINOS_CONHECIDOS.filter((d) => merged.has(d));
      } else {
        map.set(v.id, { ...v, destinosPadrao: [...folders[i].destinos] });
      }
    }
  }

  return [...map.values()].sort((a, b) => a.createdTime.localeCompare(b.createdTime));
}

/** Retorna um stream do conteúdo do vídeo (para subir no YouTube / Blob). */
export async function getVideoStream(fileId: string): Promise<Readable> {
  const drive = driveClient();
  const res = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );
  return res.data as Readable;
}

/** Baixa o vídeo inteiro em memória (Shorts são pequenos; necessário p/ Blob). */
export async function getVideoBuffer(fileId: string): Promise<Buffer> {
  const stream = await getVideoStream(fileId);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
