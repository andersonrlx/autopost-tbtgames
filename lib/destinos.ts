/**
 * Destinos = plataformas onde um vídeo deve ser publicado.
 * Fonte de verdade: a coluna `destinos` da planilha (texto tipo "youtube,instagram,facebook").
 * A pasta do Drive define o valor inicial no momento do ingest, mas o usuário
 * pode editar a célula na planilha antes de aprovar para override fino.
 */

export type Destino = "youtube" | "instagram" | "facebook" | "tiktok";

/**
 * Destinos "padrão" — usados (1) quando a célula `destinos` está vazia
 * (retrocompatibilidade com linhas antigas) e (2) quando um vídeo vem da
 * pasta "Todas". O TikTok fica DE FORA desse padrão de propósito: como a
 * conta roda em modo privado até a auditoria da TikTok aprovar, é melhor
 * exigir opt-in explícito (pasta "Só TikTok" ou editar a célula na planilha)
 * do que incluir automaticamente um destino ainda em fase de teste.
 */
export const TODOS_DESTINOS: Destino[] = ["youtube", "instagram", "facebook"];

/** Todos os destinos que o sistema reconhece — usado só para parsing/ordenação. */
export const DESTINOS_CONHECIDOS: Destino[] = [...TODOS_DESTINOS, "tiktok"];

/**
 * Interpreta a célula `destinos` da planilha.
 * - Vazio ou lixo → TODOS_DESTINOS (retrocompatível; NÃO inclui tiktok)
 * - Texto → tokens separados por vírgula, espaço, ponto-e-vírgula ou pipe
 * Aceita abreviações comuns: yt, ig, insta, fb, face, tt, tk.
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
    else if (token === "tiktok" || token === "tt" || token === "tk")
      set.add("tiktok");
  }
  // Se nada válido casou (célula com "todos" ou lixo), volta ao padrão seguro
  return set.size > 0 ? [...set] : [...TODOS_DESTINOS];
}

/** Serialização canônica para escrever na planilha. */
export function formatDestinos(destinos: Destino[]): string {
  return DESTINOS_CONHECIDOS.filter((d) => destinos.includes(d)).join(",");
}
