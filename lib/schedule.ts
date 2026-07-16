/**
 * Agendamento: 1 vídeo por dia, nas segundas, terças, quintas e sextas.
 * O horário (18h) é dado pelo cron da Vercel (21:00 UTC = 18:00 em São Paulo;
 * o Brasil não adota mais horário de verão desde 2019, então o offset é fixo).
 */

const PUBLISH_WEEKDAYS = new Set([1, 2, 4, 5]); // 1=seg, 2=ter, 4=qui, 5=sex
const SP_OFFSET_MS = -3 * 60 * 60 * 1000; // UTC-3

/** Data "de calendário" em São Paulo, como YYYY-MM-DD. */
export function spDateString(date: Date = new Date()): string {
  const sp = new Date(date.getTime() + SP_OFFSET_MS);
  return sp.toISOString().slice(0, 10);
}

function weekdayOf(dateStr: string): number {
  // Meio-dia UTC evita qualquer ambiguidade de fuso no cálculo do dia da semana
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

function nextDay(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Gera as próximas `count` datas de publicação (YYYY-MM-DD),
 * começando amanhã, pulando dias que já têm vídeo agendado.
 */
export function nextPublishDates(
  count: number,
  alreadyTaken: Set<string>
): string[] {
  const dates: string[] = [];
  let cursor = nextDay(spDateString());

  while (dates.length < count) {
    if (PUBLISH_WEEKDAYS.has(weekdayOf(cursor)) && !alreadyTaken.has(cursor)) {
      dates.push(cursor);
      alreadyTaken.add(cursor);
    }
    cursor = nextDay(cursor);
  }
  return dates;
}
