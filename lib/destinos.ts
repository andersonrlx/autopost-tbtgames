/**
 * Destinos = plataformas onde um vídeo deve ser publicado.
 * Fonte de verdade: a coluna `destinos` da planilha (texto tipo "youtube,instagram,facebook").
 * A pasta do Drive define o valor inicial no momento do ingest, mas o usuário
 * pode editar a célula na planilha antes de aprovar para override fino.
 */

export type Destino = "youtube" | "instagram" | "facebook";
export const TODOS_DESTINOS: Destino[] = ["youtube", "instagram", "facebook"];

/**
 * Interpreta a célula `destinos` da planilha.
 * - Vazio ou lixo → todos (retrocompatível com linhas antigas sem essa coluna)
 * - Texto → tokens separados por vírgula, espaço, ponto-e-vírgula ou pipe
 * Aceita abreviações comuns: yt, ig, insta, fb, face.
 */
export function parseDestinos(cell: string): Destino[] {
  const clean = (cell ?? "").toLowerCase().trim();
  if (!clean) return [...TODOS_DESTINOS];

  const tokens = clean.split(/[,;|\s]+/).filter(Boolean);
  const set = new Set<Destino>();
  for (const token of tokens) {
    if (token === "youtube" || token === "yt") set.add("youtube");
    else if (token === "instagram" || token === "ig" || token === "insta")
      set.add("instagram");
    else if (token === "facebook" || token === "fb" || token === "face")
      set.add("facebook");
  }
  // Se nada válido casou (célula com "todos" ou lixo), volta ao padrão seguro
  return set.size > 0 ? [...set] : [...TODOS_DESTINOS];
}

/** Serialização canônica para escrever na planilha. */
export function formatDestinos(destinos: Destino[]): string {
  return TODOS_DESTINOS.filter((d) => destinos.includes(d)).join(",");
}
