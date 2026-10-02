import { fetchText, stripTags, truncate } from "../text";
import type { CollectorResult, RawItem } from "./types";

const API = "https://www.googleapis.com/youtube/v3";

interface SearchResponse {
  items?: { id: { videoId: string }; snippet: { title: string; channelTitle: string } }[];
}

interface CommentsResponse {
  items?: {
    snippet: {
      topLevelComment: {
        id: string;
        snippet: { textDisplay: string; authorDisplayName: string; likeCount: number; publishedAt: string };
      };
    };
  }[];
}

/**
 * Public opinion from YouTube comments. Costs ~100 quota units per search plus 1 per
 * comment page; the free quota is 10,000 units/day.
 */
export async function collectYouTube(
  topic: string,
  days: number,
  { videos = 4, perVideo = 15, keep = 25 } = {},
): Promise<CollectorResult> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { name: "YouTube", items: [], note: "YOUTUBE_API_KEY not set" };

  const after = new Date(Date.now() - days * 86400_000).toISOString();
  const search: SearchResponse = JSON.parse(
    await fetchText(
      `${API}/search?part=snippet&type=video&order=relevance&regionCode=ID&relevanceLanguage=id` +
        `&maxResults=${videos}&publishedAfter=${after}&q=${encodeURIComponent(topic)}&key=${key}`,
    ),
  );

  const perVideoItems = await Promise.all(
    (search.items ?? []).map(async (v) => {
      try {
        const res: CommentsResponse = JSON.parse(
          await fetchText(
            `${API}/commentThreads?part=snippet&order=relevance&textFormat=plainText` +
              `&maxResults=${perVideo}&videoId=${v.id.videoId}&key=${key}`,
          ),
        );
        return (res.items ?? []).map((c): RawItem => {
          const s = c.snippet.topLevelComment.snippet;
          return {
            kind: "community",
            platform: "YouTube",
            source: `Komentar di "${truncate(stripTags(v.snippet.title), 60)}"`,
            domain: "youtube.com",
            tier: "community",
            title: "",
            snippet: truncate(stripTags(s.textDisplay), 400),
            url: `https://www.youtube.com/watch?v=${v.id.videoId}&lc=${c.snippet.topLevelComment.id}`,
            publishedAt: s.publishedAt,
            engagement: s.likeCount,
          };
        });
      } catch {
        return []; // comments disabled on this video
      }
    }),
  );

  const items = perVideoItems
    .flat()
    .filter((c) => c.snippet.length > 25)
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, keep);
  return { name: "YouTube", items };
}
