import { localFindings, parseFindings } from "@/lib/history";
import { PROMPTS, completeJSON } from "@/lib/llm";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { text?: string };
  const text = (body.text ?? "").trim().slice(0, 12000);
  if (!text) return Response.json({ findings: [] });

  const model = await completeJSON(PROMPTS.HISTORY, text);
  const findings = model ? parseFindings(model) : localFindings(text);
  return Response.json({ findings: findings.slice(0, 8) });
}
