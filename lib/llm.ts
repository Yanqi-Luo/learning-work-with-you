const NARRATOR = `Write a user's AI-working-style profile. Warm, plain, second person. No jargon.
Return JSON only:
{"summary":"one sentence","findings":[{"h":"short headline","b":"one or two sentences"}]}

Rules:
- Write ONLY the findings listed in active_findings, in that order.
- Use the exact numbers given. Never invent or round them.
- Never assign a score, percentage, or personality label.
- Never mention steps, drops, scores, or how the measurement worked. Write as if you simply noticed.
- Never call the user risk-averse, controlling, cautious or anxious. Describe the preference, not the person.`;

const EXTRACTOR = `Extract explicit AI-behaviour rules from the user's statement.
Return JSON only: {"rules":[{"text":"...","action":"act|act_report|show_first|ask|never"}]}
- One object per distinct rule. Usually 1-3.
- Rewrite each rule as a single instruction addressed to the AI, in the user's voice.
- Imperative: "Ask me before…", "Go ahead when…", "Tell me after…"
- Never "You'd want…" or "The user prefers…"
- Fix grammar and typos. Resolve dangling references.
- Under 14 words. One rule per line. End with a full stop.
- Never add a condition the user didn't state.
- Nothing actionable? {"rules":[]}`;

const REFINER = `The user is correcting an assumption about how they want AI to work with them.
Rewrite it as a single instruction addressed to the AI. Corrections only ever narrow the rule — never widen it.

- Imperative: "Ask me before…", "Go ahead when…", "Tell me after…"
- Never "You'd want…" or "The user prefers…"
- Fix grammar and typos. Resolve dangling references.
- Under 14 words. End with a full stop.
- Never add a condition the user didn't state.
- Do not quote the user.

Example:
assumption: "You'd want to be asked about anything over about $50 — is that right?"
correction: "No, above 500 dollars"
revised: "Ask me before spending more than $500."

Return JSON only: {"revised":"the instruction","narrowed_from":"the original assumption without the question"}`;

export async function completeJSON(system: string, user: string): Promise<unknown | null> {
  const key = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) return null;
  const base = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.LLM_MODEL || "gpt-4o-mini";

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content);
  } catch {
    return null;
  }
}

const HISTORY = `Read this AI conversation. Find evidence about how this person wants AI to BEHAVE or COMMUNICATE — not what they talked about.

Behaviour signals:
- told the AI to go ahead, stop, or check first
- corrected, rewrote, or undid something the AI did
- approved the same kind of action repeatedly

Communication signals:
- asked for shorter, longer, simpler, or more detailed answers
- asked for sources, reasoning, or options
- corrected tone or format
- rephrased the same request because the answer missed

Return JSON:
{"findings":[{
  "signal":"<short slug>",
  "dimension":"cost|reversibility|exposure|notification|communication",
  "direction":"more_autonomy|less_autonomy|style",
  "quote":"their exact words, under 20 words",
  "strength":"weak|medium|strong"
}]}

Ignore subject matter entirely. One instance is "weak" — still report it.
Nothing at all? {"findings":[]}`;

export const PROMPTS = { NARRATOR, EXTRACTOR, REFINER, HISTORY };
