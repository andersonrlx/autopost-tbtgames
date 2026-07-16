/**
 * Leitura centralizada das variáveis de ambiente.
 * Falha cedo, com mensagem clara, se algo obrigatório estiver faltando.
 */
export function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(
      `Variável de ambiente ausente: ${name}. ` +
        `Confira o .env.local (dev) ou as Environment Variables do projeto na Vercel.`
    );
  }
  return value;
}

export const config = {
  cronSecret: () => env("CRON_SECRET"),

  google: {
    clientId: () => env("GOOGLE_CLIENT_ID"),
    clientSecret: () => env("GOOGLE_CLIENT_SECRET"),
    refreshToken: () => env("GOOGLE_REFRESH_TOKEN"),
  },

  /** Pasta "Todas" — mantém o nome antigo por retrocompatibilidade. */
  driveFolderId: () => env("DRIVE_FOLDER_ID"),
  /** Pastas dedicadas por plataforma (opcionais). Vazio = pasta não usada. */
  driveFolderYoutube: () => process.env.DRIVE_FOLDER_ID_YT ?? "",
  driveFolderInstagram: () => process.env.DRIVE_FOLDER_ID_IG ?? "",
  driveFolderFacebook: () => process.env.DRIVE_FOLDER_ID_FB ?? "",

  sheetId: () => env("SHEET_ID"),
  sheetTab: () => env("SHEET_TAB", "Fila"),

  ytPrivacy: () => env("YT_PRIVACY", "public"),

  anthropicKey: () => env("ANTHROPIC_API_KEY"),
  claudeModel: () => env("CLAUDE_MODEL", "claude-sonnet-4-6"),

  /** Chave da Groq para transcrição via Whisper. Opcional — sem ela,
   *  o pipeline usa só o nome do arquivo como dica pra IA. */
  groqKey: () => env("GROQ_API_KEY", "___MISSING___"),
  hasGroq: () => Boolean(process.env.GROQ_API_KEY),

  meta: {
    pageToken: () => env("META_PAGE_ACCESS_TOKEN"),
    pageId: () => env("FB_PAGE_ID"),
    igUserId: () => env("IG_USER_ID"),
  },

  autoApprove: () => (process.env.AUTO_APPROVE ?? "false") === "true",
};

/** Valida o header Authorization dos crons (a Vercel envia Bearer CRON_SECRET). */
export function isAuthorizedCron(request: Request): boolean {
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${config.cronSecret()}`;
}
