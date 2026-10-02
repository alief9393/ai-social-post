import { decodeEntities, fetchText, stripTags, truncate } from "../text";

/**
 * Lightweight article text extraction with no DOM library:
 * meta description plus the first substantial <p> paragraphs.
 */
export async function extractArticle(url: string, maxChars = 900): Promise<string> {
  const html = await fetchText(url, 6000);
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<(nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, "");

  const meta =
    clean.match(/<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    clean.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:description|description)["']/i)?.[1] ??
    "";

  const paragraphs = [...clean.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripTags(m[1]))
    .filter((p) => p.length > 80 && !/baca juga|advertisement|copyright|©/i.test(p));

  const parts = [decodeEntities(meta).trim(), ...paragraphs].filter(Boolean);
  const unique = parts.filter((p, i) => parts.findIndex((q) => q.slice(0, 60) === p.slice(0, 60)) === i);
  return truncate(unique.join(" "), maxChars);
}
