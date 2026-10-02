import { XMLParser } from "fast-xml-parser";
import { domainFromOutletName, tierOf } from "../credibility";
import { domainOf, fetchText, stripTags } from "../text";
import type { CollectorResult, RawItem } from "./types";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

interface RssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  description?: string;
  source?: string | { "#text"?: string; "@_url"?: string };
}

export async function collectGoogleNews(topic: string, days: number, limit = 40): Promise<CollectorResult> {
  const q = encodeURIComponent(`${topic} when:${days}d`);
  const xml = await fetchText(`https://news.google.com/rss/search?q=${q}&hl=id&gl=ID&ceid=ID:id`);
  const doc = parser.parse(xml);
  const raw: RssItem[] = [doc?.rss?.channel?.item ?? []].flat();

  const items: RawItem[] = raw.slice(0, limit).map((it) => {
    const sourceName = typeof it.source === "string" ? it.source : it.source?.["#text"] ?? "";
    const sourceUrl = typeof it.source === "object" ? it.source?.["@_url"] ?? "" : "";
    const domain = domainOf(sourceUrl) || domainFromOutletName(sourceName);
    let title = stripTags(String(it.title ?? ""));
    if (sourceName && title.endsWith(` - ${sourceName}`)) title = title.slice(0, -(sourceName.length + 3));
    // Google News descriptions usually just repeat the headline; keep only if it adds something.
    let snippet = stripTags(String(it.description ?? "")).replace(sourceName, "").trim();
    if (snippet.startsWith(title)) snippet = snippet.slice(title.length).trim();

    return {
      kind: "news",
      platform: "Google News",
      source: sourceName || domain || "Unknown",
      domain,
      tier: tierOf(domain),
      title,
      snippet,
      url: String(it.link ?? ""),
      publishedAt: it.pubDate ? new Date(it.pubDate).toISOString() : null,
      engagement: 0,
    };
  });

  return { name: "Google News", items };
}
