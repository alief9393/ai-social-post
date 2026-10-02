import type { z } from "zod";
import { claudeJSON } from "./claude";
import { geminiJSON } from "./gemini";
import { toStrictJsonSchema } from "./schemas";

export function providerName(): string {
  return process.env.LLM_PROVIDER === "claude"
    ? `Claude (${process.env.CLAUDE_MODEL || "claude-opus-5-5"})`
    : `Gemini (${process.env.GEMINI_MODEL || "gemini-flash-latest"})`;
}

function parseLoose(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error("The model did not return valid JSON");
  }
}

/** One LLM call that must return JSON matching `schema`. Provider is chosen by LLM_PROVIDER. */
export async function generateJSON<T>(schema: z.ZodType<T>, system: string, user: string): Promise<T> {
  const jsonSchema = toStrictJsonSchema(schema);
  const text =
    process.env.LLM_PROVIDER === "claude"
      ? await claudeJSON(system, user, jsonSchema)
      : await geminiJSON(system, user, jsonSchema);

  const parsed = schema.safeParse(parseLoose(text));
  if (!parsed.success) throw new Error(`Model output did not match the expected format: ${parsed.error.message.slice(0, 300)}`);
  return parsed.data;
}
