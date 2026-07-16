# Autopost 🎬

Pipeline de publicação automática de **Shorts e Reels** para criadores de conteúdo.

**O fluxo:** você joga os vídeos numa pasta do Google Drive → a IA gera título, descrição, hashtags e tags baseados no que você **fala** no vídeo (via transcrição) → tudo cai numa planilha do Google Sheets (sua camada de revisão) → o sistema publica 1 vídeo por dia no **YouTube**, **Instagram** e **Página do Facebook**, nos dias e horários que você definir — sem abrir vídeo nenhum.

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
                └─▶ Página Facebook  (via Vercel Blob → Graph API)
```

**Pastas por plataforma (opcional):** além da pasta "Todas", você pode criar pastas dedicadas (`Só YouTube`, `Só Instagram`, `Só Facebook`) para publicar apenas onde interessa. Todos os vídeos entram na mesma fila cronológica: 1 post por dia útil, na ordem de chegada ao Drive.

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

Custo mensal realista: **menos de US$ 0,20**.

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

### Passo 6 — Chave da Anthropic

Crie uma API key em [console.anthropic.com](https://console.anthropic.com) → `ANTHROPIC_API_KEY`. Adicione uns US$ 5 de crédito — sobra pra muitos meses.

O modelo padrão é `claude-sonnet-4-6`, configurável via `CLAUDE_MODEL` sem mexer no código.

### Passo 7 — Groq (transcrição de áudio, opcional mas MUITO recomendado)

Se você preencher `GROQ_API_KEY`, o ingest transcreve o áudio de cada vídeo e passa a transcrição pra IA junto com o nome do arquivo. Resultado: títulos e descrições baseados no que você **fala**, não só no nome do arquivo. Especialmente útil pra vídeos exportados com nomes tipo `IMG_2831.mp4`.

- Cadastro grátis em [console.groq.com](https://console.groq.com) → API Keys → Create Key.
- Custo: ~US$ 0,04/hora de áudio, com free tier de 2000 requests/dia.
- Modelo usado: `whisper-large-v3-turbo` (multilíngue, ótimo em português).

Sem essa chave o pipeline segue funcionando; só perde a etapa de transcrição.

### Passo 8 — Variáveis na Vercel

Em **Settings → Environment Variables** do projeto, cadastre **todas** as variáveis do `.env.example` (o `BLOB_READ_WRITE_TOKEN` já foi criado no Passo 1). Gere o `CRON_SECRET` com:

```bash
openssl rand -hex 32
```

Depois faça um redeploy (**Deployments → ⋯ → Redeploy**) para os crons carregarem as variáveis.

### Passo 9 — Ajuste os horários de publicação

Abra `vercel.json` e ajuste o cron de publicação para os dias e horário que fazem sentido pro seu canal. O padrão é seg/ter/qui/sex às 21h UTC (18h em São Paulo).

```json
"schedule": "0 21 * * 1,2,4,5"
```

Formato: `minuto hora dia_do_mês mês dia_da_semana` (dia da semana: 0=domingo, 1=seg, ..., 6=sáb). Horário em **UTC** — descubra seu offset e ajuste. Cheatsheet: [crontab.guru](https://crontab.guru).

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
O pipeline foi desenhado para **Shorts/Reels** (arquivos de até ~150 MB, mas idealmente menores). No plano Hobby da Vercel, funções têm limite de **10 segundos** — por isso o ingest processa 1 vídeo por chamada. Se um vídeo específico precisar de muito processamento (ex: transcrição de vídeo longo), pode estourar. Nesse caso, a linha simplesmente não entra na fila e você pode tentar de novo.

---

## A planilha (sua central de controle)

| Coluna | O que é |
|---|---|
| `file_id` / `arquivo` | Identificação do vídeo no Drive (não mexa) |
| `titulo`, `descricao`, `hashtags`, `tags` | Gerados pela IA — **edite à vontade antes de aprovar** |
| `status` | `novo` → **`aprovado`** (você muda) → `publicando` → `publicado` / `erro` |
| `data_agendada` | Data da publicação (edite se quiser mudar) |
| `youtube` / `instagram` / `facebook` | Links/IDs preenchidos após publicar |
| `erro` | Avisos ou mensagens de erro |
| `criado_em` | Quando a linha entrou na fila |
| `destinos` | Plataformas onde publicar (`youtube,instagram,facebook`). Vazio = todas. **Edite antes de aprovar** para restringir |
| `blob_url` | URL temporária do vídeo no Vercel Blob (uso interno, não mexa) |

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
  api/cron/publish/route.ts   # publica nas 3 plataformas nos horários
  page.tsx                    # painel de status (somente leitura)
lib/
  ai.ts        # monta o prompt com channel.config.ts e chama Anthropic
  destinos.ts  # lógica de plataformas por vídeo
  drive.ts     # listagem e download dos vídeos das pastas
  sheets.ts    # a planilha-fila
  transcribe.ts # Groq / Whisper
  youtube.ts   # upload de Shorts
  meta.ts      # Instagram Reels + Página do Facebook (Graph API)
  blob.ts      # hospedagem temporária dos vídeos
  schedule.ts  # datas de publicação (dias da semana)
scripts/
  get-google-token.mjs        # gera o refresh token do Google (roda 1x)
vercel.json                   # crons de ingestão e publicação
```

---

## Ideias de evolução

- **Coluna `notas`** na planilha, lida pela IA para contexto extra por vídeo
- **TikTok e Kwai** (a estrutura de `meta.ts` serve de modelo)
- **Notificação no Telegram/WhatsApp** quando um vídeo entra na fila ou dá erro
- **Múltiplos slots por dia** (mais de 1 publicação diária)

---

## Licença

MIT. Fork, adapte, distribua. Se melhorou algo interessante, considera abrir um PR pro repositório original.
