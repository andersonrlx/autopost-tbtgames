import { config } from "./env";

/**
 * Notificação por SMS via Twilio (chamada direta à REST API, sem SDK —
 * evita adicionar uma dependência inteira para 1 endpoint).
 *
 * Best-effort: nunca lança erro. Se a notificação falhar, o pipeline
 * principal (agendamento/publicação) segue intacto — o SMS é um bônus,
 * não uma etapa crítica.
 *
 * Setup: console.twilio.com → cria conta → pega Account SID e Auth Token
 * na página inicial → compra um número (ou usa o de trial) → cadastra
 * TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER e
 * NOTIFY_PHONE_NUMBER na Vercel. Sem essas 4 variáveis, notificações
 * ficam desligadas silenciosamente.
 */
export async function sendSms(message: string): Promise<void> {
  if (!config.hasTwilio()) {
    console.warn(
      "[sms] Twilio não configurado (faltando alguma das 4 variáveis: " +
        "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, " +
        "NOTIFY_PHONE_NUMBER). Notificação não enviada."
    );
    return;
  }

  const sid = config.twilio.accountSid();
  const token = config.twilio.authToken();
  const from = config.twilio.fromNumber();
  const to = config.twilio.toNumber();

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const body = new URLSearchParams({ From: from, To: to, Body: message });
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    if (!res.ok) {
      const detail = await res.text();
      console.warn(`[sms] Twilio respondeu ${res.status}: ${detail.slice(0, 300)}`);
    } else {
      const data = (await res.json()) as { sid?: string; status?: string };
      console.log(`[sms] enviado ok — sid=${data.sid} status=${data.status}`);
    }
  } catch (err) {
    console.warn(`[sms] Falha ao enviar SMS: ${(err as Error).message}`);
  }
}

/** Trunca e limpa o título para caber com folga em 1 segmento de SMS (~160 chars). */
function shortTitle(titulo: string, max = 60): string {
  const clean = titulo.trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function notifyScheduled(params: {
  titulo: string;
  arquivo: string;
  dataAgendada: string;
  destinos: string;
}): Promise<void> {
  const nome = params.titulo ? shortTitle(params.titulo) : params.arquivo;
  const msg =
    `🎬 Vídeo agendado\n"${nome}"\n📅 ${params.dataAgendada}\n📡 ${params.destinos || "todas"}`;
  return sendSms(msg);
}

export function notifyScheduleFailed(params: {
  arquivo: string;
  erro: string;
}): Promise<void> {
  const msg =
    `⚠️ Vídeo entrou na fila mas a IA falhou ao gerar metadados.\n"${params.arquivo}"\nConfira a planilha.`;
  return sendSms(msg);
}

export function notifyPublished(params: {
  titulo: string;
  publicadas: string[]; // ex: ["youtube", "instagram"]
  ignoradas: string[];
  erros: string[];
}): Promise<void> {
  const nome = shortTitle(params.titulo);

  if (params.erros.length === 0) {
    const plataformas = params.publicadas.join(", ") || "nenhuma (todas ignoradas)";
    const msg = `✅ Publicado!\n"${nome}"\n📡 ${plataformas}`;
    return sendSms(msg);
  }

  const okList = params.publicadas.length ? `OK: ${params.publicadas.join(", ")}. ` : "";
  const errList = params.erros.map((e) => e.split(":")[0]).join(", ");
  const msg = `⚠️ Publicação com erro!\n"${nome}"\n${okList}Falhou: ${errList}\nConfira a planilha.`;
  return sendSms(msg);
}
