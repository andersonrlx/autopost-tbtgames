/**
 * Gera o TIKTOK_REFRESH_TOKEN necessário para o pipeline.
 *
 * Diferente do Google (que aceita o fluxo "loopback" livremente para apps
 * Desktop), o TikTok exige que o redirect URI seja CADASTRADO exatamente
 * no painel do app antes de autorizar. Este script sobe um servidor local
 * na porta 8787 — cadastre exatamente esta URL como Redirect URI no seu
 * app em developers.tiktok.com:
 *
 *   http://localhost:8787/callback
 *
 * Uso (na sua máquina, uma única vez):
 *   1. Preencha TIKTOK_CLIENT_KEY e TIKTOK_CLIENT_SECRET no .env.local
 *   2. Rode: npm run tiktok-token
 *   3. Abra a URL exibida, faça login com a conta do TikTok, autorize
 *   4. O refresh token aparece no terminal
 */
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { randomBytes } from "crypto";

const PORT = 8787;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = "user.info.basic,video.publish";

console.log("── Autopost · gerador de refresh token do TikTok ──\n");

if (!existsSync(".env.local")) {
  console.error("❌ Não encontrei .env.local nesta pasta.");
  console.error("   Rode: cp .env.example .env.local e preencha as variáveis.");
  process.exit(1);
}

const raw = readFileSync(".env.local", "utf8").replace(/^\uFEFF/, "");
for (const line of raw.split(/\r?\n/)) {
  const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/\r/g, "").replace(/^["']|["']$/g, "").trim();
  }
}

const clientKey = process.env.TIKTOK_CLIENT_KEY;
const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

if (!clientKey || !clientSecret) {
  console.error("❌ TIKTOK_CLIENT_KEY e/ou TIKTOK_CLIENT_SECRET vazios no .env.local.");
  process.exit(1);
}
console.log(`✔ Client Key encontrado: ${clientKey.slice(0, 8)}…`);
console.log(`\n⚠ Antes de continuar, confirme que cadastrou este Redirect URI`);
console.log(`  EXATO no seu app em developers.tiktok.com:\n`);
console.log(`  ${REDIRECT_URI}\n`);

const state = randomBytes(12).toString("hex");
const authUrl =
  `https://www.tiktok.com/v2/auth/authorize/` +
  `?client_key=${encodeURIComponent(clientKey)}` +
  `&response_type=code` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&state=${state}`;

async function waitForCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "", REDIRECT_URI);
      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });

      if (error) {
        res.end(`<h2>❌ TikTok recusou a autorização: ${error}</h2>`);
        server.close();
        reject(new Error(error));
        return;
      }
      if (returnedState !== state) {
        res.end("<h2>❌ State inválido — feche e tente de novo.</h2>");
        server.close();
        reject(new Error("state mismatch"));
        return;
      }
      if (code) {
        res.end("<h2>✅ Autorizado! Pode fechar esta aba e voltar ao terminal.</h2>");
        server.close();
        resolve(code);
      }
    });

    server.on("error", (err) => {
      console.error(`⚠ Não consegui abrir a porta ${PORT}: ${(err as Error).message}`);
      reject(err);
    });

    server.listen(PORT, () => {
      console.log(`✔ Servidor local aguardando o retorno da TikTok na porta ${PORT}`);
    });
  });
}

console.log("1. Abra esta URL no navegador (logado na conta do TikTok do canal):\n");
console.log(authUrl);
console.log("\n2. Autorize o acesso. A confirmação volta pra cá automaticamente.");

const code = await waitForCode();
console.log("\n✔ Código recebido, trocando por tokens…");

try {
  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.refresh_token) {
    console.error(`\n❌ Falha ao trocar código por tokens:`);
    console.error(JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log("\n✅ Pronto! Adicione ao .env.local e às variáveis da Vercel:\n");
  console.log(`TIKTOK_REFRESH_TOKEN=${data.refresh_token}\n`);
  console.log(`(access_token dura 24h e é renovado automaticamente pelo pipeline;`);
  console.log(` refresh_token dura ~1 ano — guarde-o com segurança.)`);
  process.exit(0);
} catch (err) {
  console.error(`\n❌ Erro na troca de tokens: ${(err as Error).message}`);
  process.exit(1);
}
