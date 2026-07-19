# Autopost 🎬

Pipeline de publicação automática de **Shorts e Reels** para criadores de conteúdo.

**O fluxo:** você joga os vídeos numa pasta do Google Drive → a IA gera título, descrição, hashtags e tags baseados no que você **fala** no vídeo (via transcrição) → tudo cai numa planilha do Google Sheets (sua camada de revisão) → o sistema publica no **YouTube**, **Instagram**, **Página do Facebook** e **TikTok** (opcional, ver aviso abaixo), nos dias e horários que você definir — sem abrir vídeo nenhum.

Este é um projeto open, feito pra ser forkado, personalizado e rodado com o custo mais baixo possível (basicamente centavos por mês).

```
Pastas no Drive ──▶ Cron de ingestão (diário)
                       │  Groq transcreve o áudio
                       │  Claude gera título / descrição / hashtags / tags
                       ▼
                Planilha (fila)  ◀── você revisa e marca "aprovado"
                       │
                       ▼
               Cron de publicação (dias e horário à sua escolha)
                ├─▶ YouTube Shorts   (upload direto)
                ├─▶ Instagram Reels  (via Vercel Blob → Graph API)
                ├─▶ Página Facebook  (via Vercel Blob → Graph API)
                └─▶ TikTok           (upload direto — opcional, ver Passo 5.1)
```

⚠️ **TikTok roda em modo privado até você solicitar e passar pela auditoria da TikTok** — sem isso, todo vídeo sai visível só para você. Ver Passo 5.1 para o setup e o caminho da auditoria.

**Pastas por plataforma (opcional):** além da pasta "Todas", você pode criar pastas dedicadas (`Só YouTube`, `Só Instagram`, `Só Facebook`, `Só TikTok`) para publicar apenas onde interessa. Todos os vídeos entram na mesma fila cronológica: 1 post por dia útil, na ordem de chegada ao Drive. **Diferença importante:** o TikTok não entra automaticamente pela pasta "Todas" (só pela pasta dedicada ou editando a coluna `destinos` na planilha) — ver Passo 5.1.

---

## Requisitos e custos

| Serviço | Uso | Custo estimado (30 vídeos/mês) |
|---|---|---|
| Vercel (Hobby) | Hospedagem + crons | **Grátis** |
| Vercel Blob | Storage temporário | Frações de centavo |
| Google Cloud | APIs Drive/Sheets/YouTube | **Grátis** (uso pessoal) |
| Anthropic API | Geração de metadados | ~US$ 0,10 |
| Groq API | Transcrição de áudio | Provavelmente grátis (free tier: 2000 req/dia) |
| Meta (Facebook/Instagram) | Publicação | **Grátis** |
| TikTok (Content Posting API) | Publicação | **Grátis** (opcional) |
| Twilio | Avisos por SMS (opcional) | Poucos dólares/mês (~60 SMS) |

Custo mensal realista: **menos de US$ 0,20** sem SMS; **poucos dólares** se ativar o Twilio.

---

## Como funciona no dia a dia

1. Exporte os Shorts/Reels e **jogue na pasta do Drive**. Se você configurou o Groq, o nome do arquivo não precisa fazer sentido — a IA gera títulos a partir da sua fala.
2. Todo dia às 9h a ingestão roda e processa **um vídeo** da pasta: transcreve o áudio, gera os metadados com IA e agenda no próximo slot livre.
3. Se você quiser **encher a fila de uma vez** (ex: subiu 30 vídeos hoje), dispare o ingest manualmente em loop:
   ```bash
   for i in {1..30}; do
     curl -H "Authorization: Bearer $CRON_SECRET" https://SEU-PROJETO.vercel.app/api/cron/ingest
     sleep 2
   done
   ```
   Cada disparo processa 1 vídeo (~5-8 segundos). Você verá `"restantes": N` na resposta pra saber quanto falta.
4. Abra a planilha, revise título/descrição (edite à vontade) e mude a coluna `status` de `novo` para **`aprovado`**.
5. No dia e horário agendados, o vídeo sai nas plataformas listadas em `destinos`. A planilha é atualizada com os links e o status vira `publicado`.
6. O painel em `https://seu-projeto.vercel.app` mostra a fila e o que já foi ao ar (somente leitura, bom pra conferir do celular).
7. (Opcional) Se configurar o Twilio, você recebe um SMS quando um vídeo é agendado e quando é publicado — dizendo em quais plataformas.

> **Modo turbo:** se quiser pular a revisão editorial, mude `AUTO_APPROVE=true` na Vercel. Recomendo manter `false` nas primeiras semanas até confiar nos títulos gerados.

---

## Setup completo

O caminho é longo mas é linear. Reserve umas 2 horas na primeira vez, com café. Depois disso, o sistema roda sozinho.

### Passo 0 — Personalize o canal (`channel.config.ts`)

Antes de mais nada, abra o arquivo `channel.config.ts` na raiz do projeto e preencha com o contexto do **seu** canal: nome, temas, tom de voz, saudação, formatos de título que funcionam pra você. Este arquivo é o "cérebro editorial" do sistema — quanto mais específico, melhor a IA vai imitar sua voz. Prompt genérico = resultado genérico.

Também escolha ali a `youtubeCategoryId` que combina com seu canal (a lista de opções está no comentário do arquivo).

### Passo 1 — Repositório e Vercel

1. Faça um fork ou baixe este código, crie um repositório no GitHub e suba.
2. Na Vercel: **Add New → Project → importe o repositório**. Todo `git push` publica automaticamente.
3. No projeto da Vercel, vá em **Storage → Create → Blob** e crie um Blob Store. Isso gera a variável `BLOB_READ_WRITE_TOKEN` automaticamente.

### Passo 2 — Google Cloud (Drive + Sheets + YouTube)

1. Acesse [console.cloud.google.com](https://console.cloud.google.com) logado com a **conta do canal** e crie um projeto.
2. Em **APIs & Services → Library**, ative estas 3 APIs:
   - **Google Drive API**
   - **Google Sheets API**
   - **YouTube Data API v3**
3. Em **APIs & Services → OAuth consent screen**: tipo **External**, preencha nome e e-mail, e em **Test users** adicione o e-mail da conta do canal.
4. Em **Credentials → Create Credentials → OAuth client ID**, tipo **Desktop app**. Copie o **Client ID** e o **Client Secret**.
5. **Importante:** clique em **Publish App** no consent screen. Sem isso, o refresh token expira em 7 dias. Publicar não exige verificação do Google se o app é pra uso próprio.

### Passo 3 — Refresh token do Google

Na sua máquina:

```bash
npm install
cp .env.example .env.local
# preencha GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env.local
npm run google-token
```

Abra a URL exibida, autorize com a conta do canal, e o refresh token será mostrado no terminal.

### Passo 4 — Pastas do Drive e planilha

1. Crie a **pasta principal** no Drive (ex.: `Shorts - Todas`) e copie o ID da URL → `DRIVE_FOLDER_ID`. Vídeos aqui vão para as três plataformas.
2. (Opcional) Crie pastas **dedicadas por plataforma** e copie os IDs → `DRIVE_FOLDER_ID_YT`, `DRIVE_FOLDER_ID_IG`, `DRIVE_FOLDER_ID_FB`. Você pode adicionar essas pastas depois — o sistema ignora as que não tiverem ID configurado.
3. Crie uma planilha nova com uma aba chamada **Fila** e copie o ID da URL → `SHEET_ID`. O cabeçalho (15 colunas) é criado automaticamente na primeira execução.

> Todas as pastas e a planilha devem estar na **mesma conta Google que autorizou o token**. Não compartilhe entre contas — mais simples é ter tudo na conta do canal.

### Passo 5 — Meta (Instagram + Facebook)

Pré-requisito: conta **profissional** do Instagram vinculada à **Página** do Facebook. Isso se configura no Meta Business Suite.

1. Em [developers.facebook.com](https://developers.facebook.com), crie um app do tipo **Business**.
2. Adicione os produtos **Facebook Login for Business** e **Instagram** (variante "com login do Facebook").
3. No **Graph API Explorer** ([developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer)):
   - Selecione seu app
   - Em permissões, adicione: `pages_manage_posts`, `pages_read_engagement`, `pages_show_list`, `instagram_basic`, `instagram_content_publish`
   - Clique em **Generate Access Token** e autorize com sua conta administradora da Página
   - **Importante:** na tela de autorização, **selecione explicitamente** a Página do seu canal. Não deixe passar batido — se não marcar, o token vem sem acesso a nenhuma Página.
4. Esse token é curto. Transforme em token de longa duração:
   ```bash
   # 1) user token curto → user token de 60 dias
   curl "https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=SEU_APP_ID&client_secret=SEU_APP_SECRET&fb_exchange_token=TOKEN_CURTO"
   ```
5. Descubra os IDs da sua Página e do Instagram:
   ```bash
   # Debug do token — mostra os IDs alcançáveis
   curl "https://graph.facebook.com/debug_token?input_token=TOKEN_60_DIAS&access_token=SEU_APP_ID|SEU_APP_SECRET"
   ```
   Na resposta, procure `granular_scopes`. O `target_ids` das permissões de `pages_*` é seu `FB_PAGE_ID`. O das permissões `instagram_*` é seu `IG_USER_ID`.
6. Pegue o token permanente da Página:
   ```bash
   curl "https://graph.facebook.com/v21.0/SEU_FB_PAGE_ID?fields=name,access_token&access_token=TOKEN_60_DIAS"
   ```
   O `access_token` na resposta é seu `META_PAGE_ACCESS_TOKEN`. Este não expira.
7. **Higiene:** depois de tudo funcionando, vá em Configurações do app → Básico e **redefina o App Secret**. Os tokens já emitidos continuam válidos — mas o secret que passou pela sua história do terminal vira papel picado.

### Passo 5.1 — TikTok (Content Posting API, opcional)

⚠️ **Leia isto antes de configurar:** enquanto o seu app não passar pela auditoria da TikTok, **todo vídeo publicado sai forçosamente como privado** (`SELF_ONLY` — só você vê, nem seus seguidores). Não existe meio-termo como "não listado". A configuração abaixo já deixa tudo funcionando nesse modo privado — é útil pra "aquecer" a automação e confirmar que está tudo certo antes/enquanto você aguarda a auditoria aprovar.

**Setup técnico:**

1. Crie uma conta em [developers.tiktok.com](https://developers.tiktok.com), crie uma organização e um app dentro dela.
2. Anote o **Client Key** e o **Client Secret** do app → `TIKTOK_CLIENT_KEY` e `TIKTOK_CLIENT_SECRET`.
3. No app, adicione os produtos **Login Kit** e **Content Posting API**. Dentro do Content Posting API, habilite **Direct Post**.
4. Em **Login Kit → Redirect URI**, cadastre exatamente:
   ```
   http://localhost:8787/callback
   ```
5. Solicite os escopos `user.info.basic` e `video.publish`.
6. Na sua máquina, gere o refresh token:
   ```bash
   npm run tiktok-token
   ```
   Abre a URL exibida, autoriza com a conta do TikTok do canal, e o `TIKTOK_REFRESH_TOKEN` aparece no terminal.
7. Cadastre `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REFRESH_TOKEN` na Vercel. Deixe `TIKTOK_PRIVACY=SELF_ONLY` (o padrão) até a auditoria aprovar.
8. Crie a pasta `Shorts - Só TikTok` no Drive (o TikTok não entra automaticamente pela pasta "Todas" — veja o porquê logo abaixo) e cadastre o ID em `DRIVE_FOLDER_ID_TK`.

**Caminho das pedras pra pedir a auditoria (quando quiser sair do modo privado):**

1. No painel do app, procure a opção de **aplicar para auditoria** do Content Posting API / Direct Post.
2. Você vai precisar preencher:
   - **URL de política de privacidade** e **termos de uso** — hospede duas páginas simples (podem ser markdown estático no mesmo projeto, ou um Google Doc público) descrevendo o que a ferramenta faz com os dados.
   - **Vídeo de demonstração** mostrando o fluxo completo de publicação funcionando.
   - **Descrição do app**: explique o objetivo (gerenciar publicação de conteúdo de criadores) e — isso importa — a TikTok declara nos critérios que apps **não podem ser limitados a uso interno/privado**. Se a ferramenta for usada por mais de um criador/canal (o que este projeto foi desenhado pra permitir), mencione isso explicitamente na resposta; é um argumento que ajuda a aprovação.
3. **Seja honesto sobre não ter uma UI de consentimento por vídeo.** As diretrizes da TikTok pressupõem um app onde o criador vê e confirma cada publicação numa tela antes de ir ao ar (nível de privacidade, permissões de duet/stitch etc). Este pipeline é headless — a "aprovação" acontece na planilha, não numa tela do TikTok. Isso pode gerar idas e voltas no processo de revisão; não é motivo pra desistir, só pra não se surpreender se pedirem ajustes.
4. O prazo costuma ser de alguns dias a duas semanas. Se for reprovado, a resposta geralmente vem com o motivo — dá pra ajustar e reenviar.
5. Aprovado, é só trocar `TIKTOK_PRIVACY` de `SELF_ONLY` para `PUBLIC_TO_EVERYONE` na Vercel e redeploy. Nenhuma outra mudança de código necessária.

**Por que o TikTok não entra na pasta "Todas":** diferente do YouTube/Instagram/Facebook, o TikTok fica em modo experimental (privado) até a auditoria aprovar. Fica mais seguro exigir opt-in explícito — pela pasta dedicada ou editando a coluna `destinos` na planilha — em vez de todo vídeo da pasta "Todas" ganhar automaticamente um destino que ainda não é público de verdade.

### Passo 6 — Chave da Anthropic

Crie uma API key em [console.anthropic.com](https://console.anthropic.com) → `ANTHROPIC_API_KEY`. Adicione uns US$ 5 de crédito — sobra pra muitos meses.

O modelo padrão é `claude-sonnet-4-6`, configurável via `CLAUDE_MODEL` sem mexer no código.

### Passo 7 — Groq (transcrição de áudio, opcional mas MUITO recomendado)

Se você preencher `GROQ_API_KEY`, o ingest extrai o áudio de cada vídeo (via FFmpeg, embutido no projeto) e manda pra Groq transcrever. O texto vai pra IA junto com o nome do arquivo, então título e descrição saem baseados no que você **fala**, não só no nome do arquivo. Especialmente útil pra vídeos exportados com nomes tipo `IMG_2831.mp4`.

- Cadastro grátis em [console.groq.com](https://console.groq.com) → API Keys → Create Key.
- Custo: ~US$ 0,04/hora de áudio, com free tier de 2000 requests/dia.
- Modelo usado: `whisper-large-v3-turbo` (multilíngue, ótimo em português).
- **Por que extrai o áudio em vez de mandar o vídeo inteiro:** a Groq tem um limite de 25 MB por arquivo — e isso vale tanto pra upload direto quanto pra envio por URL. Um Short de 30-60s facilmente passa de 25 MB de vídeo, mas o **áudio sozinho** (comprimido em MP3 mono 64kbps) fica na casa de algumas centenas de KB, não importa o quão grande seja o vídeo. Por isso o pipeline extrai só o áudio antes de mandar.
- O FFmpeg usado é um binário estático (`@ffmpeg-installer/ffmpeg`), empacotado junto no deploy — não precisa instalar nada à parte. Isso deixa o bundle da função ~70 MB maior, ainda bem dentro do limite de funções serverless da Vercel.

Sem essa chave o pipeline segue funcionando; só perde a etapa de transcrição.

### Passo 7.1 — Twilio (avisos por SMS, opcional)

Se você preencher as 4 variáveis do Twilio, o pipeline manda um SMS em dois momentos: quando um vídeo é **agendado** (ingest) e quando é **publicado** (mostrando em quais plataformas). Se a geração de metadados falhar no ingest, você também recebe um aviso pra checar a planilha.

1. Crie uma conta em [console.twilio.com](https://console.twilio.com). O **Account SID** e o **Auth Token** aparecem na página inicial do console → `TWILIO_ACCOUNT_SID` e `TWILIO_AUTH_TOKEN`.
2. Compre ou ative um número Twilio para enviar os SMS (**Phone Numbers → Buy a number**) → `TWILIO_FROM_NUMBER` (formato E.164, ex: `+18445551234`).
3. `NOTIFY_PHONE_NUMBER` é o número que recebe os avisos (o seu celular), também em E.164 (ex: `+5511999998888`).
4. **Se a conta for trial (grátis)**: o Twilio só manda SMS pra números **verificados** — cadastre seu celular em Phone Numbers → Verified Caller IDs antes de testar. Contas trial também prefixam as mensagens com "Sent from your Twilio trial account". Pra remover isso e enviar pra qualquer número, é preciso fazer upgrade da conta (ainda pré-pago, sem mensalidade).
5. Custo: poucos centavos por SMS enviado. No seu volume (agendamento + publicação de ~30 vídeos/mês = ~60 SMS), o gasto fica na casa de poucos dólares por mês.

Sem essas variáveis o pipeline funciona normal, só sem os avisos.

### Passo 8 — Variáveis na Vercel

Em **Settings → Environment Variables** do projeto, cadastre **todas** as variáveis do `.env.example` (o `BLOB_READ_WRITE_TOKEN` já foi criado no Passo 1). Gere o `CRON_SECRET` com:

```bash
openssl rand -hex 32
```

Depois faça um redeploy (**Deployments → ⋯ → Redeploy**) para os crons carregarem as variáveis.

### Passo 9 — Ajuste os horários de publicação

Abra `vercel.json` — por padrão o projeto já vem com **2 disparos diários** de publicação (meio-dia e 18h de São Paulo), pensados pra permitir publicar esporadicamente num horário alternativo sem precisar disparar manualmente. Ajuste os horários (ou remova um deles) conforme fizer sentido pro seu canal:

```json
"schedule": "0 15 * * *"
```

Formato: `minuto hora dia_do_mês mês dia_da_semana`. Horário em **UTC** — descubra seu offset e ajuste. Cheatsheet: [crontab.guru](https://crontab.guru).

**Importante sobre múltiplos disparos por dia:** cada disparo do cron de publicação processa **no máximo 1 vídeo** (o primeiro aprovado com data vencida, na ordem da planilha). Se só 1 vídeo estiver aprovado num dia, o primeiro disparo que rodar publica ele — o outro não encontra nada e não faz nada, sem risco de duplicar. Se você aprovar 2 vídeos pro mesmo dia, cada disparo publica um.

Também ajuste `lib/schedule.ts` se você quer publicar em outros dias da semana. A linha:
```typescript
const PUBLISH_WEEKDAYS = new Set([1, 2, 4, 5]);
```
define os dias que a ingestão vai considerar como "válidos" pra agendar. Se você publica todo dia, use `new Set([0, 1, 2, 3, 4, 5, 6])`.

---

## ⚠️ Três avisos importantes

### 1. Auditoria do YouTube
Vídeos enviados por projetos de API **não auditados** ficam travados como **privados**, mesmo pedindo `public`. Enquanto a auditoria não sai:
- Deixe `YT_PRIVACY=private` e torne os vídeos públicos manualmente no YouTube Studio (2 cliques), **ou**
- Solicite a auditoria (gratuita) no [formulário de compliance da API do YouTube](https://support.google.com/youtube/contact/yt_api_form).

A cota padrão da API permite ~6 uploads/dia — 1/dia passa folgado.

### 2. Precisão do horário nos planos da Vercel
No plano **Hobby**, o horário do cron pode variar dentro da hora. No plano **Pro**, o disparo é pontual. Se precisar de precisão sem pagar Pro, use um serviço como [cron-job.org](https://cron-job.org) chamando as URLs com o header `Authorization: Bearer SEU_CRON_SECRET`.

### 3. Tamanho dos arquivos e limite de execução
O pipeline foi desenhado para **Shorts/Reels** (arquivos de até ~150 MB, mas idealmente menores). No plano Hobby da Vercel, funções têm limite de **10 segundos** — por isso o ingest processa 1 vídeo por chamada. Dentro desses 10s cabem: baixar o vídeo do Drive, extrair o áudio (rápido, geralmente menos de 1s para um Short), transcrever na Groq e gerar os metadados na Anthropic. Para a maioria dos Shorts isso roda em 3-8s. Se algum vídeo específico estourar o tempo (rede lenta, vídeo maior que o normal), a linha simplesmente não entra na fila naquela tentativa — não há corrupção de dados, é só rodar o ingest de novo.

---

## A planilha (sua central de controle)

| Coluna | O que é |
|---|---|
| `file_id` / `arquivo` | Identificação do vídeo no Drive (não mexa) |
| `titulo`, `descricao`, `hashtags`, `tags` | Gerados pela IA — **edite à vontade antes de aprovar** |
| `status` | `novo` → **`aprovado`** (você muda) → `publicando` → `publicado` / `erro` |
| `data_agendada` | Data da publicação (edite se quiser mudar) |
| `youtube` / `instagram` / `facebook` / `tiktok` | Links/IDs preenchidos após publicar |
| `erro` | Avisos ou mensagens de erro |
| `criado_em` | Quando a linha entrou na fila |
| `destinos` | Plataformas onde publicar (`youtube,instagram,facebook,tiktok`). Vazio = `youtube,instagram,facebook` (retrocompatibilidade — **não** inclui TikTok). **Edite antes de aprovar** para restringir ou adicionar `tiktok` |
| `blob_url` | URL temporária do vídeo no Vercel Blob, usada pelo Instagram/Facebook (uso interno, não mexa). O TikTok não usa esta coluna |

**Se der erro em uma plataforma:** as outras não são desfeitas — o que subiu fica com o link preenchido na planilha. Corrija a causa, mude o `status` de volta para **`aprovado`**, e na próxima execução o sistema tenta de novo **apenas** as plataformas com a coluna vazia. Nada é repostado.

---

## Testando

Qualquer cron pode ser disparado na mão:

```bash
curl -H "Authorization: Bearer SEU_CRON_SECRET" https://SEU-PROJETO.vercel.app/api/cron/ingest
curl -H "Authorization: Bearer SEU_CRON_SECRET" https://SEU-PROJETO.vercel.app/api/cron/publish
```

**Sugestão de primeiro teste:**
1. Suba **1** vídeo na pasta do Drive
2. Dispare a ingestão → confira a planilha, veja se título/descrição saíram bem
3. Revise/edite se quiser, mude `status` pra `aprovado`
4. Configure `YT_PRIVACY=unlisted` na Vercel (assim o YouTube fica só pra quem tem o link)
5. Ajuste `data_agendada` pra hoje e dispare o publish manualmente
6. Confira YouTube (Studio), Instagram e Facebook

Se tudo funcionou, volte `YT_PRIVACY` pra `public` e deixe o cron rodar sozinho.

---

## Estrutura do projeto

```
channel.config.ts             # 👈 personalize aqui: nome, tom, contexto do canal
app/
  api/cron/ingest/route.ts    # detecta vídeos novos + transcrição + IA + planilha
  api/cron/publish/route.ts   # publica nas plataformas configuradas, nos horários
  page.tsx                    # painel de status (somente leitura)
lib/
  ai.ts         # monta o prompt (calibrado por plataforma) com channel.config.ts
  audio.ts      # extração de áudio via FFmpeg (para a transcrição)
  destinos.ts   # lógica de quais plataformas cada vídeo vai
  drive.ts      # listagem e download dos vídeos das pastas
  sheets.ts     # a planilha-fila
  transcribe.ts # Groq / Whisper
  youtube.ts    # upload de Shorts
  meta.ts       # Instagram Reels + Página do Facebook (Graph API)
  tiktok.ts     # publicação no TikTok (Content Posting API, FILE_UPLOAD)
  blob.ts       # hospedagem temporária dos vídeos
  schedule.ts   # datas de publicação (dias da semana)
  sms.ts        # avisos por SMS via Twilio (agendamento/publicação)
scripts/
  get-google-token.mjs  # gera o refresh token do Google (roda 1x)
  get-tiktok-token.mjs  # gera o refresh token do TikTok (roda 1x)
vercel.json              # crons de ingestão e publicação
```

---

## Ideias de evolução

- **Coluna `notas`** na planilha, lida pela IA para contexto extra por vídeo
- **Kwai** e outras plataformas de vídeo curto (a estrutura de `tiktok.ts`/`meta.ts` serve de modelo)
- **Notificação no Telegram** como alternativa/complemento ao SMS
- **Múltiplos slots por dia** com controle explícito de horário por linha (hoje o horário é implícito pela ordem da planilha quando há mais de um vídeo aprovado no mesmo dia)

---

## Licença

MIT. Fork, adapte, distribua. Se melhorou algo interessante, considera abrir um PR pro repositório original.
