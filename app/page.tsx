import { getRows, type QueueRow } from "@/lib/sheets";
import { parseDestinos, TODOS_DESTINOS, type Destino } from "@/lib/destinos";
import { channelConfig } from "@/channel.config";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEST_LABEL: Record<Destino, string> = {
  youtube: "YT",
  instagram: "IG",
  facebook: "FB",
};

function DestinosBadges({ raw }: { raw: string }) {
  const destinos = new Set(parseDestinos(raw));
  return (
    <span className="dests">
      {TODOS_DESTINOS.map((d) => (
        <span
          key={d}
          className={`dest ${destinos.has(d) ? "dest-on" : "dest-off"}`}
          title={d}
        >
          {DEST_LABEL[d]}
        </span>
      ))}
    </span>
  );
}

/**
 * Painel interno de status da fila.
 * A edição continua sendo feita na planilha — aqui é só leitura rápida
 * pra conferir do celular o que está agendado e o que já saiu.
 */

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  novo: { label: "AGUARDANDO REVISÃO", color: "var(--amber)" },
  aprovado: { label: "NA FILA", color: "var(--cyan)" },
  publicando: { label: "PUBLICANDO…", color: "var(--cyan)" },
  publicado: { label: "NO AR", color: "var(--green)" },
  erro: { label: "ERRO", color: "var(--red)" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? { label: status.toUpperCase(), color: "#888" };
  return (
    <span className="badge" style={{ color: s.color, borderColor: s.color }}>
      {s.label}
    </span>
  );
}

export default async function Home() {
  let rows: QueueRow[] = [];
  let loadError = "";
  try {
    rows = await getRows();
  } catch (err) {
    loadError = (err as Error).message;
  }

  const pending = rows.filter((r) => r.status !== "publicado");
  const published = rows.filter((r) => r.status === "publicado");

  return (
    <main className="wrap">
      <header className="header">
        <h1>
          {channelConfig.name.toUpperCase()}<span className="blink">▮</span>AUTOPOST
        </h1>
        <p className="sub">
          fila de shorts &amp; reels · seg ter qui sex · 18:00
        </p>
      </header>

      {loadError ? (
        <div className="panel error-panel">
          <strong>Não consegui ler a planilha.</strong>
          <p>{loadError}</p>
          <p>Confira as variáveis SHEET_ID e credenciais do Google na Vercel.</p>
        </div>
      ) : (
        <>
          <section className="panel">
            <h2>▸ NA FILA ({pending.length})</h2>
            {pending.length === 0 ? (
              <p className="empty">
                Fila vazia. Jogue vídeos na pasta do Drive — a ingestão roda
                todo dia às 9h.
              </p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>data</th>
                    <th>título</th>
                    <th>dest</th>
                    <th>status</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((r) => (
                    <tr key={r.fileId}>
                      <td className="mono">{r.dataAgendada || "—"}</td>
                      <td>{r.titulo || <em>{r.arquivo} (sem título ainda)</em>}</td>
                      <td><DestinosBadges raw={r.destinos} /></td>
                      <td>
                        <StatusBadge status={r.status} />
                        {r.erro && <div className="err-msg">{r.erro}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="panel">
            <h2>▸ PUBLICADOS ({published.length})</h2>
            {published.length === 0 ? (
              <p className="empty">Nada publicado ainda.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>data</th>
                    <th>título</th>
                    <th>dest</th>
                    <th>links</th>
                  </tr>
                </thead>
                <tbody>
                  {published.map((r) => (
                    <tr key={r.fileId}>
                      <td className="mono">{r.dataAgendada}</td>
                      <td>{r.titulo}</td>
                      <td><DestinosBadges raw={r.destinos} /></td>
                      <td className="links">
                        {r.youtube && (
                          <a href={r.youtube} target="_blank" rel="noreferrer">
                            YT
                          </a>
                        )}
                        {r.instagram && <span title={r.instagram}>IG ✓</span>}
                        {r.facebook && <span title={r.facebook}>FB ✓</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      <footer className="footer">
        revisão e edição: direto na planilha do Google Sheets · mude o status
        para <b>aprovado</b> para liberar a publicação
      </footer>
    </main>
  );
}
