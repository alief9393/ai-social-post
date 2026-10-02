import { tierOf } from "../credibility";
import { fetchText, truncate } from "../text";
import { extractArticle } from "./article";
import type { CollectorResult, RawItem } from "./types";

interface GdeltArticle {
  url: string;
  title: string;
  seendate: string; // 20260928T094500Z
  domain: string;
  language: string;
}

function parseSeenDate(s: string): string | null {
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  return m ? new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`).toISOString() : null;
}

/**
 * GDELT indexes news worldwide and returns real article URLs, so we can read the body text.
 * It rejects keywords shorter than 3 characters and allows one request per 5 seconds.
 */
export async function collectGdelt(
  topic: string,
  days: number,
  { limit = 25, readBodies = 8 } = {},
): Promise<CollectorResult> {
  const words = topic.split(/\s+/).filter((w) => w.length >= 3);
  if (!words.length) return { name: "GDELT", items: [], note: "Topic words too short for GDELT" };

  const query = `${words.map((w) => (/\W/.test(w) ? `"${w}"` : w)).join(" ")} sourcecountry:indonesia`;
  const url =
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}` +
    `&mode=artlist&format=json&maxrecords=${limit}&timespan=${days}d&sort=hybridrel`;

  let body: string;
  try {
    body = await fetchText(url, 15000);
  } catch (err) {
    if (!String(err).includes("429")) throw err;
    await new Promise((r) => setTimeout(r, 5500)); // GDELT asks for 5s between requests
    body = await fetchText(url, 15000);
  }
  if (!body.trim().startsWith("{")) {
    return { name: "GDELT", items: [], note: truncate(body.trim(), 120) };
  }
  const articles: GdeltArticle[] = JSON.parse(body).articles ?? [];

  const items: RawItem[] = articles.map((a) => ({
    kind: "news",
    platform: "GDELT",
    source: a.domain,
    domain: a.domain.replace(/^www\./, ""),
    tier: tierOf(a.domain.replace(/^www\./, "")),
    title: a.title.replace(/\s+/g, " ").trim(),
    snippet: "",
    url: a.url,
    publishedAt: parseSeenDate(a.seendate),
    engagement: 0,
  }));

  // Read article text for the most credible items first.
  const order = { primary: 0, established: 1, media: 2, unknown: 3, community: 4 };
  const toRead = [...items].sort((a, b) => order[a.tier] - order[b.tier]).slice(0, readBodies);
  await Promise.all(
    toRead.map(async (it) => {
      try {
        it.snippet = await extractArticle(it.url);
      } catch {
        // keep headline only
      }
    }),
  );

  return { name: "GDELT", items };
}
