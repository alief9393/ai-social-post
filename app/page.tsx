"use client";

import { useEffect, useState } from "react";
import type { Category, Label, Lang, ResearchResult, StreamEvent, Verdict } from "@/lib/types";

const LABEL_TEXT: Record<Label, string> = {
  verified: "Terverifikasi",
  likely: "Cukup kuat",
  disputed: "Diperdebatkan",
  unverified: "Belum terverifikasi",
};

const CATEGORY_TEXT: Record<Category, string> = {
  context: "Apa yang terjadi",
  negative: "Dampak negatif / kekhawatiran",
  positive: "Dampak positif",
  solution: "Siapa yang memperbaiki & bagaimana",
};

const VERDICT_TEXT: Record<Verdict, string> = {
  concern_valid: "Kekhawatiran berdasar",
  exaggerated: "Cenderung dibesar-besarkan",
  mixed: "Campuran",
  insufficient: "Data belum cukup",
};

function load(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable (private mode)
  }
}

export default function Home() {
  const [topic, setTopic] = useState("");
  const [days, setDays] = useState(7);
  const [lang, setLang] = useState<Lang>("id");
  const [passcode, setPasscode] = useState("");
  const [needPasscode, setNeedPasscode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [trending, setTrending] = useState<{ title: string; traffic: string }[]>([]);

  useEffect(() => {
    setPasscode(load("passcode"));
  }, []);

  useEffect(() => {
    fetch("/api/trending", { headers: { "x-passcode": passcode } })
      .then((r) => {
        if (r.status === 401) setNeedPasscode(true);
        return r.ok ? r.json() : { topics: [] };
      })
      .then((d) => setTrending(d.topics ?? []))
      .catch(() => setTrending([]));
  }, [passcode]);

  async function run(fresh = false) {
    if (!topic.trim() || busy) return;
    setBusy(true);
    setError("");
    setProgress([]);
    setResult(null);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-passcode": passcode },
        body: JSON.stringify({ topic, lang, days, fresh }),
      });
      if (res.status === 401) {
        setNeedPasscode(true);
        throw new Error("Passcode salah atau belum diisi.");
      }
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as StreamEvent;
          if (ev.type === "progress") setProgress((p) => [...p, ev.message]);
          else if (ev.type === "result") setResult(ev.data);
          else setError(ev.message);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Radar Tren</h1>
      <p className="muted">
        Ketik topik. Sistem mengumpulkan berita &amp; komentar, menilai kekuatan setiap fakta, lalu menulis draf Threads
        yang hanya memakai fakta tersebut.
      </p>

      {needPasscode && (
        <div className="card">
          <label className="small">
            Passcode&nbsp;
            <input
              type="password"
              value={passcode}
              onChange={(e) => {
                setPasscode(e.target.value);
                save("passcode", e.target.value);
              }}
            />
          </label>
        </div>
      )}

      <form
        className="search"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <input
          type="text"
          placeholder="mis. data center AI air Jatiluhur"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Rentang waktu">
          <option value={3}>3 hari</option>
          <option value={7}>7 hari</option>
          <option value={14}>14 hari</option>
          <option value={30}>30 hari</option>
        </select>
        <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label="Bahasa output">
          <option value="id">Bahasa Indonesia</option>
          <option value="en">English</option>
        </select>
        <button className="primary" disabled={busy || !topic.trim()}>
          {busy ? "Menganalisis…" : "Analisis"}
        </button>
      </form>

      {trending.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="small muted" style={{ marginBottom: 6 }}>
            Sedang trending di Google Indonesia:
          </div>
          <div className="chips">
            {trending.map((t) => (
              <button key={t.title} type="button" className="chip" onClick={() => setTopic(t.title)}>
                {t.title} <span className="muted">{t.traffic}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {(progress.length > 0 || error) && (
        <div className="card">
          <ul className="progress">
            {progress.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
          {error && <p className="error">⚠ {error}</p>}
        </div>
      )}

      {result && <Result r={result} onRefresh={() => run(true)} />}
    </main>
  );
}

function Result({ r, onRefresh }: { r: ResearchResult; onRefresh: () => void }) {
  const itemById = new Map(r.items.map((i) => [i.id, i]));
  const moodTotal = r.mood.negative + r.mood.positive + r.mood.neutral;

  return (
    <>
      <div className={`card verdict ${r.verdict.stance}`}>
        <h2>
          Kesimpulan bukti: {VERDICT_TEXT[r.verdict.stance]}
        </h2>
        <p style={{ margin: "0 0 8px" }}>{r.verdict.explanation}</p>
        <p className="muted" style={{ margin: 0 }}>
          {r.overview}
        </p>
      </div>

      <div className="card">
        <h2>Draf Threads</h2>
        {r.drafts.map((d, i) => (
          <DraftView key={i} draft={d} />
        ))}
      </div>

      {(Object.keys(CATEGORY_TEXT) as Category[]).map((cat) => {
        const list = r.claims.filter((c) => c.category === cat).sort((a, b) => b.score - a.score);
        return (
          <div className="card" key={cat}>
            <h2>{CATEGORY_TEXT[cat]}</h2>
            {list.length === 0 && <p className="muted small">Tidak ada sumber yang membahas ini.</p>}
            {list.map((c) => (
              <div className="claim" key={c.id}>
                <div className="claim-head">
                  <span className={`badge ${c.label}`}>{LABEL_TEXT[c.label]}</span>
                  <span
                    className="small muted"
                    title={`Kredibilitas ${c.breakdown.quality}/35 · Konfirmasi ${c.breakdown.corroboration}/40 · Spesifik ${c.breakdown.specificity}/10 · Terkini ${c.breakdown.recency}/15`}
                  >
                    skor {c.score} · {c.id}
                  </span>
                </div>
                <div>{c.statement}</div>
                <div className="claim-sources">
                  {c.sources.map((s, i) => (
                    <span key={i}>
                      {i > 0 && " · "}
                      <a href={s.url} target="_blank" rel="noreferrer">
                        {s.name}
                      </a>
                    </span>
                  ))}
                  {c.contradictingIds.length > 0 && (
                    <>
                      {" "}
                      — dibantah oleh:{" "}
                      {c.contradictingIds.map((id) => itemById.get(id)?.source ?? id).join(", ")}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {moodTotal > 0 && (
        <div className="card">
          <h2>Suasana komentar publik</h2>
          <div className="mood" role="img" aria-label="Sebaran sentimen komentar">
            <span style={{ width: `${(r.mood.negative / moodTotal) * 100}%`, background: "var(--neg)" }} />
            <span style={{ width: `${(r.mood.neutral / moodTotal) * 100}%`, background: "var(--neu)" }} />
            <span style={{ width: `${(r.mood.positive / moodTotal) * 100}%`, background: "var(--pos)" }} />
          </div>
          <div className="small muted">
            {r.mood.negative} negatif · {r.mood.neutral} netral · {r.mood.positive} positif (dari {moodTotal} komentar
            YouTube teratas)
          </div>
        </div>
      )}

      {r.timeline.length > 0 && (
        <div className="card">
          <h2>Kronologi</h2>
          <ul className="timeline">
            {r.timeline.map((t, i) => (
              <li key={i}>
                <span className="small muted">{t.date}</span>
                <span>{t.event}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <details>
          <summary>Semua sumber ({r.items.length})</summary>
          <ol className="sources">
            {r.items.map((it) => (
              <li key={it.id}>
                [{it.id}] <a href={it.url} target="_blank" rel="noreferrer">{it.title || it.snippet.slice(0, 100)}</a>{" "}
                <span className="muted">
                  — {it.source}
                  {it.publishedAt ? `, ${it.publishedAt.slice(0, 10)}` : ""}
                  {it.alsoReportedBy.length ? ` (+${it.alsoReportedBy.length} media lain)` : ""}
                </span>
              </li>
            ))}
          </ol>
        </details>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Sumber data:{" "}
          {r.sourceStatus
            .map((s) => `${s.name} ${s.ok ? `✓ ${s.count}` : `✗${s.note ? ` (${s.note})` : ""}`}`)
            .join(" · ")}
          <br />
          Ditulis oleh {r.provider} · {new Date(r.generatedAt).toLocaleString("id-ID")} ·{" "}
          <button type="button" className="chip" onClick={onRefresh}>
            Riset ulang
          </button>
        </p>
      </div>
    </>
  );
}

function DraftView({ draft }: { draft: ResearchResult["drafts"][number] }) {
  const [text, setText] = useState(draft.text);
  const [copied, setCopied] = useState(false);
  const chars = [...text].length;

  return (
    <div className="draft">
      <h3 style={{ textTransform: "capitalize" }}>{draft.tone}</h3>
      <textarea
        className="draft-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        style={{ width: "100%", font: "inherit", color: "inherit", background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}
      />
      <div className="draft-meta">
        <span className={chars > 500 ? "warn" : "muted"}>{chars}/500</span>
        <span className="muted">memakai: {draft.claimIds.join(", ") || "—"}</span>
        <button
          type="button"
          className="chip"
          onClick={() => {
            navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? "Tersalin ✓" : "Salin"}
        </button>
      </div>
      {draft.warnings.map((w, i) => (
        <div key={i} className="warn">
          ⚠ {w}
        </div>
      ))}
    </div>
  );
}
