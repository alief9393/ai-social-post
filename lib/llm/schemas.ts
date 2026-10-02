import { z } from "zod";

export const ExtractionSchema = z.object({
  timeline: z.array(
    z.object({
      date: z.string(),
      event: z.string(),
      sourceIds: z.array(z.string()),
    }),
  ),
  claims: z.array(
    z.object({
      category: z.enum(["context", "negative", "positive", "solution"]),
      statement: z.string(),
      supportingIds: z.array(z.string()),
      contradictingIds: z.array(z.string()),
    }),
  ),
  communityStance: z.array(
    z.object({
      id: z.string(),
      stance: z.enum(["negative", "positive", "neutral"]),
    }),
  ),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

export const WritingSchema = z.object({
  overview: z.string(),
  verdict: z.object({
    stance: z.enum(["concern_valid", "exaggerated", "mixed", "insufficient"]),
    explanation: z.string(),
  }),
  drafts: z.array(
    z.object({
      tone: z.string(),
      text: z.string(),
      claimIds: z.array(z.string()),
    }),
  ),
});
export type Writing = z.infer<typeof WritingSchema>;

type JsonSchema = Record<string, unknown>;

/** JSON Schema for structured outputs: every object closed, every property required. */
export function toStrictJsonSchema(schema: z.ZodType): JsonSchema {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const out: JsonSchema = {};
    for (const [k, v] of Object.entries(node)) if (k !== "$schema") out[k] = walk(v);
    if (out.type === "object" && out.properties) {
      out.additionalProperties = false;
      out.required = Object.keys(out.properties as object);
    }
    return out;
  };
  return walk(z.toJSONSchema(schema)) as JsonSchema;
}
