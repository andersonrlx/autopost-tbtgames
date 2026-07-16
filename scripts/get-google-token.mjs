/**
 * Gera o GOOGLE_REFRESH_TOKEN necessário para o pipeline.
 *
 * Uso (na sua máquina, uma única vez):
 *   1. Preencha GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env.local
 *   2. Rode: npm run google-token
 *   3. Abra a URL exibida, faça login com a conta do canal, autorize
 *   4. Cole o código de volta no terminal
 *   5. Copie o refresh token exibido para o .env.local e para a Vercel
 *
 * IMPORTANTE: no Google Cloud Console, o OAuth Client precisa ser do tipo
 * "Desktop app" (ou ter http://localhost como redirect autorizado).
 */
import { google } from "googleapis";
import { createInterface } from "readline/promises";
import { readFileSync, existsSync } from "fs";

// Carrega .env.local manualmente (sem dependência extra)
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    "Preencha GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env.local antes de rodar."
  );
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(
  clientId,
  clientSecret,
  "urn:ietf:wg:oauth:2.0:oob" // fluxo manual: código colado no terminal
);

const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/youtube.upload",
];

const url = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES,
});

console.log("\n1. Abra esta URL no navegador (logado na conta do canal):\n");
console.log(url);
console.log("\n2. Autorize e copie o código exibido.\n");

const rl = createInterface({ input: process.stdin, output: process.stdout });
const code = await rl.question("3. Cole o código aqui: ");
rl.close();

const { tokens } = await oauth2.getToken(code.trim());

console.log("\n✅ Pronto! Adicione ao .env.local e à Vercel:\n");
console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
