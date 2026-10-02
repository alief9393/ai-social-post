import { generateJSON, providerName } from "./llm";
import { EXTRACT_SYSTEM, WRITE_SYSTEM, extractUser, writeUser } from "./llm/prompts";
import { ExtractionSchema, WritingSchema } from "./llm/schemas";
import { dedupeNews, scoreClaim, selectItems } from "./scoring";
import { collectGdelt } from "./sources/gdelt";
import { collectGoogleNews } from "./sources/googleNews";
import type { CollectorResult, RawItem } from "./sources/types";
import { collectYouTube } from "./sources/youtube";
import type { Draft, Item, Lang, ResearchResult, ScoredClaim, SourceStatus } from "./types";

const MAX_DRAFT_CHARS = 500;

export async function runResearch(
  topic: string,
  lang: Lang,
  days: number,
  progress: (msg: string) => void,
): Promise<ResearchResult> {
  // 1. Collect (no AI)
  progress("Mengumpulkan berita dan komentar…");
  const collectors: [string, () => Promise<CollectorResult>][] = [
    ["Google News", () => collectGoogleNews(topic, days)],
    ["GDELT", () => collectGdelt(topic, days)],
    ["YouTube", () => collectYouTube(topic, days)],
  ];
  const settled = await Promise.allSettled(collectors.map(([, fn]) => fn()));

  const sourceStatus: SourceStatus[] = [];
  const raw: RawItem[] = [];
  settled.forEach((r, i) => {
    const name = collectors[i][0];
    if (r.status === "fulfilled") {
      raw.push(...r.value.items);
      sourceStatus.push({ name, ok: r.value.items.length > 0, count: r.value.items.length, note: r.value.note });
    } else {
      sourceStatus.push({ name, ok: false, count: 0, note: String(r.reason?.message ?? r.reason) });
    }
  });

  const news = dedupeNews(raw.filter((r) => r.kind === "news"));
  const community = raw.filter((r) => r.kind === "community");
  const items = selectItems(news, community);
  progress(`Terkumpul ${raw.length} item → ${news.length} berita unik, ${community.length} komentar.`);

  if (items.filter((i) => i.kind === "news").length < 3) {
    throw new Error("Not enough news found for this topic. Try broader keywords or a longer time range.");
  }

  // 2. Extract claims (LLM call 1)
  progress(`Mengekstrak klaim dari sumber (${providerName()})…`);
  const extraction = await generateJSON(ExtractionSchema, EXTRACT_SYSTEM, extractUser(topic, lang, items));

  // 3. Score claims (no AI)
  const byId = new Map<string, Item>(items.map((i) => [i.id, i]));
  const claims = extraction.claims
    .map((c, i) => scoreClaim(c, i, byId))
    .filter((c): c is ScoredClaim => !!c)
    .map((c, i) => ({ ...c, id: `F${i + 1}` }));

  const mood = { negative: 0, positive: 0, neutral: 0 };
  for (const s of extraction.communityStance) if (byId.get(s.id)?.kind === "community") mood[s.stance]++;

  const counts = claims.reduce<Record<string, number>>((acc, c) => ((acc[c.label] = (acc[c.label] ?? 0) + 1), acc), {});
  progress(
    `Skor fakta: ${counts.verified ?? 0} terverifikasi, ${counts.likely ?? 0} cukup kuat, ` +
      `${counts.disputed ?? 0} diperdebatkan, ${counts.unverified ?? 0} belum terverifikasi.`,
  );
  if (!claims.length) throw new Error("No claims could be grounded in the collected sources.");

  // 4. Write narrative (LLM call 2)
  progress("Menulis ringkasan dan draf Threads…");
  const writing = await generateJSON(WritingSchema, WRITE_SYSTEM, writeUser(topic, lang, claims, mood));

  const claimById = new Map(claims.map((c) => [c.id, c]));
  const drafts: Draft[] = writing.drafts.map((d) => {
    const warnings: string[] = [];
    const chars = [...d.text].length;
    if (chars > MAX_DRAFT_CHARS) warnings.push(`Terlalu panjang untuk Threads (${chars}/${MAX_DRAFT_CHARS})`);
    const used = d.claimIds.map((id) => claimById.get(id)).filter((c): c is ScoredClaim => !!c);
    if (!used.length) warnings.push("Draf tidak merujuk ke klaim mana pun — periksa manual");
    const weak = used.filter((c) => c.label === "unverified");
    if (weak.length) warnings.push(`Menggunakan klaim belum terverifikasi: ${weak.map((c) => c.id).join(", ")}`);
    return { ...d, claimIds: used.map((c) => c.id), chars, warnings };
  });

  const validIds = new Set(items.map((i) => i.id));
  return {
    topic,
    lang,
    generatedAt: new Date().toISOString(),
    provider: providerName(),
    overview: writing.overview,
    verdict: writing.verdict,
    timeline: extraction.timeline.map((t) => ({ ...t, sourceIds: t.sourceIds.filter((id) => validIds.has(id)) })),
    claims,
    mood,
    drafts,
    items,
    sourceStatus,
  };
}
