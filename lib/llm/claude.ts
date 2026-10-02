import Anthropic from "@anthropic-ai/sdk";

// Models that accept server-side refusal fallbacks (`fallbacks: "default"`).
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1"]);

let client: Anthropic | null = null;

export async function claudeJSON(system: string, user: string, schema: Record<string, unknown>): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic();
  const model = process.env.CLAUDE_MODEL || "claude-opus-5-5";
  const withFallback = FALLBACK_MODELS.has(model);

  const response = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: user }],
    output_config: {
      format: { type: "json_schema", schema },
      ...(model.startsWith("claude-haiku") ? {} : { effort: "medium" as const }),
    },
    ...(withFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
  });

  if (response.stop_reason === "refusal") throw new Error("Claude declined this request.");
  if (response.stop_reason === "max_tokens") throw new Error("Claude response was cut off (max_tokens).");

  return response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
}
