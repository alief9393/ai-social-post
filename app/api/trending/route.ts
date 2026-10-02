import { checkPasscode } from "@/lib/auth";
import { fetchTrending } from "@/lib/sources/trends";

export const runtime = "nodejs";

export async function GET(req: Request) {
  if (!checkPasscode(req)) return Response.json({ error: "Wrong passcode" }, { status: 401 });
  try {
    const topics = await fetchTrending("ID");
    return Response.json({ topics: topics.slice(0, 20) }, { headers: { "Cache-Control": "private, max-age=600" } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
