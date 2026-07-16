import { sheetsClient } from "./google";
import { config } from "./env";

/**
 * A planilha é a "fila" e também a camada de revisão editorial.
 * Colunas (A → O):
 *  A file_id | B arquivo | C titulo | D descricao | E hashtags | F tags
 *  G status  | H data_agendada | I youtube | J instagram | K facebook
 *  L erro    | M criado_em | N destinos | O blob_url
 *
 * `blob_url` guarda a URL temporária no Vercel Blob (usada para transcrição
 * e reaproveitada pelo publish). Fica vazia após a publicação (blob apagado).
 *
 * Status possíveis: novo → aprovado → publicando → publicado | erro
 */

export const HEADER = [
  "file_id",
  "arquivo",
  "titulo",
  "descricao",
  "hashtags",
  "tags",
  "status",
  "data_agendada",
  "youtube",
  "instagram",
  "facebook",
  "erro",
  "criado_em",
  "destinos",
  "blob_url",
] as const;

const LAST_COL = "O"; // atualizar se o header crescer

export interface QueueRow {
  rowNumber: number; // linha real na planilha (1-indexado, header = 1)
  fileId: string;
  arquivo: string;
  titulo: string;
  descricao: string;
  hashtags: string;
  tags: string;
  status: string;
  dataAgendada: string; // YYYY-MM-DD
  youtube: string;
  instagram: string;
  facebook: string;
  erro: string;
  criadoEm: string;
  destinos: string; // "youtube,instagram,facebook" — vazio = todos (retrocompat)
  blobUrl: string;  // URL no Vercel Blob (vazio = não subiu ou já apagado)
}

function tabRange(range: string) {
  return `${config.sheetTab()}!${range}`;
}

/** Garante que a primeira linha da aba tem o cabeçalho esperado. */
export async function ensureHeader(): Promise<void> {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId(),
    range: tabRange(`A1:${LAST_COL}1`),
  });
  const current = res.data.values?.[0] ?? [];
  if (current.join("|") !== HEADER.join("|")) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: config.sheetId(),
      range: tabRange(`A1:${LAST_COL}1`),
      valueInputOption: "RAW",
      requestBody: { values: [[...HEADER]] },
    });
  }
}

/** Lê todas as linhas da fila. */
export async function getRows(): Promise<QueueRow[]> {
  const sheets = sheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: config.sheetId(),
    range: tabRange(`A2:${LAST_COL}`),
  });
  const values = res.data.values ?? [];
  return values.map((v, i) => ({
    rowNumber: i + 2,
    fileId: v[0] ?? "",
    arquivo: v[1] ?? "",
    titulo: v[2] ?? "",
    descricao: v[3] ?? "",
    hashtags: v[4] ?? "",
    tags: v[5] ?? "",
    status: (v[6] ?? "").toLowerCase().trim(),
    dataAgendada: v[7] ?? "",
    youtube: v[8] ?? "",
    instagram: v[9] ?? "",
    facebook: v[10] ?? "",
    erro: v[11] ?? "",
    criadoEm: v[12] ?? "",
    destinos: v[13] ?? "",
    blobUrl: v[14] ?? "",
  }));
}

/** Acrescenta novas linhas na fila. */
export async function appendRows(rows: string[][]): Promise<void> {
  const sheets = sheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: config.sheetId(),
    range: tabRange(`A:${LAST_COL}`),
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
}

/** Atualiza campos específicos de uma linha (por número da linha). */
export async function updateRow(
  rowNumber: number,
  patch: Partial<Record<(typeof HEADER)[number], string>>
): Promise<void> {
  const sheets = sheetsClient();
  const data = Object.entries(patch).map(([key, value]) => {
    const colIndex = HEADER.indexOf(key as (typeof HEADER)[number]);
    const colLetter = String.fromCharCode(65 + colIndex); // A=65
    return {
      range: tabRange(`${colLetter}${rowNumber}`),
      values: [[value ?? ""]],
    };
  });

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: config.sheetId(),
    requestBody: { valueInputOption: "RAW", data },
  });
}
