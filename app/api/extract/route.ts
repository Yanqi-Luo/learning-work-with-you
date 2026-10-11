import { PROMPTS, completeJSON } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { transcript?: string };
  const transcript = (body.transcript ?? "").trim();
  if (!transcript) return Response.json({ rules: [] });

  const model = await completeJSON(PROMPTS.EXTRACTOR, transcript);
  if (model && typeof model === "object" && "rules" in model && Array.isArray(model.rules)) {
    const rules = model.rules
      .filter((rule) => rule && typeof rule === "object" && "text" in rule && String(rule.text).trim())
      .map((rule) => ({ text: String(rule.text).trim() }));
    return Response.json({ rules });
  }

  return Response.json({ rules: [{ text: transcript }] });
}
