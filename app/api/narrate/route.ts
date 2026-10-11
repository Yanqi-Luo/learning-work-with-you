import { PROMPTS, completeJSON } from "@/lib/llm";
import { templateNarration, type NarrateInput } from "@/lib/templates";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const input = (await request.json()) as NarrateInput;
  const fallback = templateNarration(input);
  const model = await completeJSON(PROMPTS.NARRATOR, JSON.stringify(input));

  if (
    model &&
    typeof model === "object" &&
    "summary" in model &&
    "findings" in model &&
    typeof model.summary === "string" &&
    Array.isArray(model.findings)
  ) {
    const findings = model.findings
      .filter((item) => item && typeof item === "object" && "h" in item && "b" in item)
      .map((item) => ({ h: String(item.h), b: String(item.b) }));
    if (findings.length === input.active_findings.length) {
      return Response.json({ summary: model.summary, findings, answersKey: input.answersKey });
    }
  }

  return Response.json(fallback);
}
