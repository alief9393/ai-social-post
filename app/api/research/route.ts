import { checkPasscode } from "@/lib/auth";
import { runResearch } from "@/lib/pipeline";
import type { Lang, ResearchResult, StreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

// Per-instance cache: repeating the same search within 30 minutes costs nothing.
const CACHE_TTL = 30 * 60_000;
const cache = new Map<string, { at: number; data: ResearchResult }>();

export async function POST(req: Request) {
  if (!checkPasscode(req)) return Response.json({ error: "Wrong passcode" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { topic?: string; lang?: string; days?: number; fresh?: boolean };
  const topic = (body.topic ?? "").trim().slice(0, 120);
  if (topic.length < 2) return Response.json({ error: "Topic is required" }, { status: 400 });
  const lang: Lang = body.lang === "en" ? "en" : "id";
  const days = [3, 7, 14, 30].includes(Number(body.days)) ? Number(body.days) : 7;

  const key = `${topic.toLowerCase()}|${lang}|${days}`;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        const hit = cache.get(key);
        if (!body.fresh && hit && Date.now() - hit.at < CACHE_TTL) {
          send({ type: "progress", message: "Memakai hasil tersimpan (< 30 menit)." });
          send({ type: "result", data: hit.data });
        } else {
          const data = await runResearch(topic, lang, days, (message) => send({ type: "progress", message }));
          cache.set(key, { at: Date.now(), data });
          send({ type: "result", data });
        }
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
