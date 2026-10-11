import { PROMPTS, completeJSON } from "@/lib/llm";

export const dynamic = "force-dynamic";

function asStatement(text: string) {
  return text
    .replace(/\s*[—–-]\s*(is that right\??|right\??)\s*$/i, "")
    .replace(/\s*\?\s*$/, "")
    .trim();
}

function fallbackRevised(claim: string, text: string, chips: string[]) {
  let revised = asStatement(claim);
  const correction = [text, ...chips].filter(Boolean).join(" ");
  const amount =
    correction.match(/\$\s*([\d,]+)/)?.[1] ??
    correction.match(/(\d[\d,]*)\s*dollars?/i)?.[1] ??
    correction.match(/(?:above|over|under|below|about|around|than|like)\s+\$?\s*(\d[\d,]*)/i)?.[1];
  if (amount && /\$\s*[\d,]+/.test(revised)) {
    const numeric = Number(amount.replace(/,/g, ""));
    if (Number.isFinite(numeric)) {
      revised = revised.replace(/\$\s*[\d,]+/, `$${numeric.toLocaleString("en-US")}`);
    }
  }
  return revised;
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    claim?: string;
    answer?: string;
    chips?: string[];
    text?: string;
  };
  const claim = body.claim ?? "";
  const answer = body.answer ?? "";
  const chips = body.chips ?? [];
  const text = (body.text ?? "").trim();

  const model = await completeJSON(
    PROMPTS.REFINER,
    JSON.stringify({
      assumption: claim,
      correction: [text, ...chips].filter(Boolean).join(". "),
      answer,
    }),
  );

  if (
    model &&
    typeof model === "object" &&
    "revised" in model &&
    typeof model.revised === "string" &&
    model.revised.trim()
  ) {
    const narrowed =
      "narrowed_from" in model && typeof model.narrowed_from === "string" && model.narrowed_from.trim()
        ? asStatement(model.narrowed_from)
        : asStatement(claim);
    return Response.json({ revised: asStatement(model.revised), narrowed_from: narrowed });
  }

  return Response.json({
    revised: fallbackRevised(claim, text, chips),
    narrowed_from: asStatement(claim),
  });
}
