# Radar Tren

Type a topic → the app collects Indonesian news and public comments, scores every claim by its sources, and writes Threads drafts that only use claims the sources back up.

## How it works

```
topic ─► 1. Collect (no AI)      Google News RSS · GDELT (+ article text) · YouTube comments
      ─► 2. Merge & rank (no AI) same story from several outlets = corroboration
      ─► 3. LLM call #1          extract claims, each tied to the item ids it came from
      ─► 4. Score (no AI)        0-100 per claim → verified / likely / disputed / unverified
      ─► 5. LLM call #2          verdict + overview + 3 drafts (tenang / edukatif / tegas)
```

The LLM never assigns scores. `lib/scoring.ts` computes them:

| Part | Max | Based on |
|---|---|---|
| Source quality | 35 | best tier among supporting sources (`lib/credibility.ts`) |
| Corroboration | 40 | number of independent news domains (1 → 14, 2 → 28, 3+ → 40) |
| Specificity | 10 | claim has numbers **and** those numbers appear in the sources |
| Recency | 15 | newest source ≤7 days → 15, ≤30 days → 9 |

Labels: a credible contradicting source → **disputed**; only comments → **unverified**; ≥70 with no unmatched numbers → **verified**; ≥50 → **likely** (stated with attribution); otherwise **unverified**. Drafts that rely on unverified claims or exceed 500 characters get a warning.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill in the keys
npm run dev                  # http://localhost:3000
```

| Variable | Needed | Notes |
|---|---|---|
| `GEMINI_API_KEY` | yes (default provider) | free at https://aistudio.google.com/apikey |
| `LLM_PROVIDER` | no | `gemini` (default) or `claude` |
| `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` | only for Claude | default `claude-opus-5-5`; `claude-sonnet-5-5` / `claude-haiku-4-5` are cheaper |
| `YOUTUBE_API_KEY` | no | enables public-comment mood; free 10k units/day (~90 searches) |
| `APP_PASSCODE` | recommended | required to use the app once deployed |

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. On vercel.com → **Add New Project** → import the repo (framework auto-detected as Next.js).
3. Add the environment variables above under **Settings → Environment Variables**.
4. Deploy and share the URL and passcode.

`/api/research` sets `maxDuration = 300`. Vercel Hobby with Fluid compute (the default) allows that; if your project caps lower, reduce it in `app/api/research/route.ts`.

## Tuning

- **Source tiers:** edit the domain lists in `lib/credibility.ts`.
- **Writing rules / tones:** `lib/llm/prompts.ts`.
- **Score weights and thresholds:** `scoreClaim` in `lib/scoring.ts`.

## Known limits

- Google News gives headlines only (its links are redirects), so the deeper text comes from GDELT, which is rate-limited (1 request / 5 s) and sometimes returns 429 on shared hosting. The app keeps going and shows the status under "Sumber data".
- Reddit and X are not included: both block or charge for unauthenticated API access.
- The result cache is in memory per server instance, so it isn't shared between instances.
