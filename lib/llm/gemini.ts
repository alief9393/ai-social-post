interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

const RETRYABLE = new Set([500, 502, 503, 504]);
const RETRY_DELAYS_MS = [2000, 6000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Primary model first, then fallbacks. Each model has its own free-tier quota. */
function modelChain(): string[] {
  const primary = process.env.GEMINI_MODEL || "gemini-flash-latest";
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-flash-lite-latest")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}

export async function geminiJSON(system: string, user: string, schema: Record<string, unknown>): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  const call = async (model: string, withSchema: boolean) => {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: "application/json",
          ...(withSchema ? { responseJsonSchema: schema } : {}),
        },
      }),
      signal: AbortSignal.timeout(120_000),
    });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as GeminiResponse };
  };

  const errors: string[] = [];
  for (const model of modelChain()) {
    let withSchema = true;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      const { status, body } = await call(model, withSchema);

      if (status === 200) {
        if (body.promptFeedback?.blockReason) throw new Error(`Gemini blocked the request: ${body.promptFeedback.blockReason}`);
        const text = (body.candidates?.[0]?.content?.parts ?? [])
          .filter((p) => !p.thought)
          .map((p) => p.text ?? "")
          .join("");
        if (text) return text;
        errors.push(`${model}: empty response (${body.candidates?.[0]?.finishReason ?? "no candidates"})`);
        break;
      }

      const msg = `${model}: ${status} ${body.error?.message ?? ""}`.trim();
      // Some models reject parts of JSON Schema; retry in plain JSON mode (output is validated with zod anyway).
      if (status === 400 && withSchema) {
        withSchema = false;
        attempt--;
        continue;
      }
      if (RETRYABLE.has(status) && attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      errors.push(msg);
      break; // 429 (quota), auth errors, or retries exhausted → try the next model
    }
  }

  throw new Error(
    `All Gemini models failed. Free-tier servers may be busy; try again in a few minutes.\n${errors.join("\n")}`,
  );
}
