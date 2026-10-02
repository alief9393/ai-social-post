import { XMLParser } from "fast-xml-parser";
import { fetchText, stripTags } from "../text";

const parser = new XMLParser({ ignoreAttributes: false });

export interface TrendingTopic {
  title: string;
  traffic: string;
  news: { title: string; url: string; source: string }[];
}

interface TrendNewsItem {
  "ht:news_item_title"?: string;
  "ht:news_item_url"?: string;
  "ht:news_item_source"?: string;
}

export async function fetchTrending(geo = "ID"): Promise<TrendingTopic[]> {
  const xml = await fetchText(`https://trends.google.com/trending/rss?geo=${geo}`);
  const items: Record<string, unknown>[] = [parser.parse(xml)?.rss?.channel?.item ?? []].flat();
  return items.map((it) => ({
    title: stripTags(String(it.title ?? "")),
    traffic: String(it["ht:approx_traffic"] ?? ""),
    news: [(it["ht:news_item"] as TrendNewsItem | TrendNewsItem[] | undefined) ?? []].flat().map((n) => ({
      title: stripTags(String(n["ht:news_item_title"] ?? "")),
      url: String(n["ht:news_item_url"] ?? ""),
      source: String(n["ht:news_item_source"] ?? ""),
    })),
  }));
}
