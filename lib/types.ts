export type Lang = "id" | "en";

export type Tier = "primary" | "established" | "media" | "unknown" | "community";

/** One piece of collected evidence: a news article or a community comment. */
export interface Item {
  id: string; // "N1" for news, "C1" for community
  kind: "news" | "community";
  platform: string; // "Google News", "GDELT", "YouTube"
  source: string; // outlet or channel name
  domain: string;
  tier: Tier;
  title: string;
  snippet: string;
  url: string;
  publishedAt: string | null; // ISO
  engagement: number; // likes etc. (community only)
  /** Other domains that reported the same story (merged duplicates). */
  alsoReportedBy: string[];
}

export type Category = "context" | "negative" | "positive" | "solution";

export type Label = "verified" | "likely" | "disputed" | "unverified";

export interface ScoredClaim {
  id: string;
  category: Category;
  statement: string;
  supportingIds: string[];
  contradictingIds: string[];
  score: number; // 0-100
  label: Label;
  breakdown: { quality: number; corroboration: number; specificity: number; recency: number };
  sources: { name: string; url: string; tier: Tier }[];
}

export interface TimelineEntry {
  date: string;
  event: string;
  sourceIds: string[];
}

export type Verdict = "concern_valid" | "exaggerated" | "mixed" | "insufficient";

export interface Draft {
  tone: string;
  text: string;
  claimIds: string[];
  chars: number;
  warnings: string[];
}

export interface SourceStatus {
  name: string;
  ok: boolean;
  count: number;
  note?: string;
}

export interface ResearchResult {
  topic: string;
  lang: Lang;
  generatedAt: string;
  provider: string;
  overview: string;
  verdict: { stance: Verdict; explanation: string };
  timeline: TimelineEntry[];
  claims: ScoredClaim[];
  mood: { negative: number; positive: number; neutral: number };
  drafts: Draft[];
  items: Item[];
  sourceStatus: SourceStatus[];
}

export type StreamEvent =
  | { type: "progress"; message: string }
  | { type: "result"; data: ResearchResult }
  | { type: "error"; message: string };
