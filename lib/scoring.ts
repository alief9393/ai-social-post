import { TIER_WEIGHT } from "./credibility";
import type { RawItem } from "./sources/types";
import { jaccard, tokens } from "./text";
import type { Category, Item, Label, ScoredClaim } from "./types";

const DAY = 86400_000;

function ageDays(iso: string | null): number | null {
  return iso ? (Date.now() - new Date(iso).getTime()) / DAY : null;
}

/**
 * Merge news items that report the same story (similar headlines). The merged item keeps
 * the other outlets in `alsoReportedBy`, which later counts as corroboration.
 */
export function dedupeNews(raw: RawItem[]): Omit<Item, "id">[] {
  const kept: (Omit<Item, "id"> & { _tok: Set<string> })[] = [];
  for (const r of raw) {
    const tok = tokens(r.title);
    const dup = kept.find((k) => jaccard(k._tok, tok) >= 0.55);
    if (!dup) {
      kept.push({ ...r, alsoReportedBy: [], _tok: tok });
      continue;
    }
    if (r.domain && r.domain !== dup.domain && !dup.alsoReportedBy.includes(r.domain)) {
      dup.alsoReportedBy.push(r.domain);
    }
    // Prefer the more credible / more detailed version as the representative.
    if (TIER_WEIGHT[r.tier] > TIER_WEIGHT[dup.tier] || (!dup.snippet && r.snippet && r.tier === dup.tier)) {
      const others = dup.alsoReportedBy.filter((d) => d !== r.domain);
      if (dup.domain) others.push(dup.domain);
      Object.assign(dup, { ...r, alsoReportedBy: others, _tok: dup._tok });
    }
  }
  return kept.map(({ _tok, ...rest }) => rest);
}

/** Pick the evidence we send to the LLM and give each item a short id. */
export function selectItems(news: Omit<Item, "id">[], community: RawItem[], maxNews = 30, maxCommunity = 15): Item[] {
  const rank = (it: Omit<Item, "id">) => {
    const age = ageDays(it.publishedAt) ?? 14;
    const recency = Math.max(0.2, 1 - age / 30);
    const corroboration = 1 + Math.min(it.alsoReportedBy.length, 4) * 0.25;
    return TIER_WEIGHT[it.tier] * recency * corroboration + (it.snippet ? 0.15 : 0);
  };
  const topNews = [...news].sort((a, b) => rank(b) - rank(a)).slice(0, maxNews);
  const topCommunity = [...community].sort((a, b) => b.engagement - a.engagement).slice(0, maxCommunity);
  return [
    ...topNews.map((it, i) => ({ ...it, id: `N${i + 1}` })),
    ...topCommunity.map((it, i) => ({ ...it, alsoReportedBy: [], id: `C${i + 1}` })),
  ];
}

const numbersIn = (s: string) => (s.match(/\d+(?:[.,]\d+)*/g) ?? []).map((n) => n.replace(/[.,]/g, ""));

export interface ExtractedClaim {
  category: Category;
  statement: string;
  supportingIds: string[];
  contradictingIds: string[];
}

/**
 * Deterministic fact score (0-100). The LLM only says which items a claim came from;
 * the score itself is computed here from the sources:
 *   quality (35)       best source tier among supporting items
 *   corroboration (40) independent news domains reporting it
 *   specificity (10)   numbers in the claim, and whether they appear in the sources
 *   recency (15)       age of the newest supporting item
 */
export function scoreClaim(c: ExtractedClaim, index: number, byId: Map<string, Item>): ScoredClaim | null {
  const support = c.supportingIds.map((id) => byId.get(id)).filter((x): x is Item => !!x);
  if (!support.length) return null; // claim not grounded in anything we collected
  const contra = c.contradictingIds.map((id) => byId.get(id)).filter((x): x is Item => !!x);

  const quality = Math.max(...support.map((s) => TIER_WEIGHT[s.tier]));

  const domains = new Set<string>();
  for (const s of support) {
    if (s.kind !== "news") continue;
    if (s.domain) domains.add(s.domain);
    s.alsoReportedBy.forEach((d) => domains.add(d));
  }
  const corroboration = [0, 0.35, 0.7][domains.size] ?? 1;

  const claimNums = numbersIn(c.statement);
  const sourceText = support.map((s) => `${s.title} ${s.snippet}`).join(" ").replace(/[.,]/g, "");
  const numbersMissing = claimNums.filter((n) => !sourceText.includes(n));
  const specificity = claimNums.length === 0 ? 0.5 : numbersMissing.length ? 0 : 1;

  const ages = support.map((s) => ageDays(s.publishedAt)).filter((a): a is number => a !== null);
  const newest = ages.length ? Math.min(...ages) : null;
  const recency = newest === null ? 0.5 : newest <= 7 ? 1 : newest <= 30 ? 0.6 : 0.3;

  const breakdown = {
    quality: Math.round(quality * 35),
    corroboration: Math.round(corroboration * 40),
    specificity: Math.round(specificity * 10),
    recency: Math.round(recency * 15),
  };
  const score = breakdown.quality + breakdown.corroboration + breakdown.specificity + breakdown.recency;

  const credibleContradiction = contra.some((s) => s.kind === "news" && TIER_WEIGHT[s.tier] >= TIER_WEIGHT.media);
  const communityOnly = support.every((s) => s.kind === "community");

  let label: Label;
  if (credibleContradiction) label = "disputed";
  else if (communityOnly) label = "unverified";
  else if (score >= 70 && numbersMissing.length === 0) label = "verified";
  else if (score >= 50) label = "likely";
  else label = "unverified";

  return {
    id: `F${index + 1}`,
    category: c.category,
    statement: c.statement,
    supportingIds: support.map((s) => s.id),
    contradictingIds: contra.map((s) => s.id),
    score,
    label,
    breakdown,
    sources: support.map((s) => ({ name: s.source, url: s.url, tier: s.tier })),
  };
}
