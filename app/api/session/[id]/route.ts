import { getSession, putSession } from "@/lib/db";
import { emptySession, type Session } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(session);
}

export async function PUT(request: Request, { params }: Params) {
  const { id } = await params;
  const body = (await request.json()) as Partial<Session>;
  const existing = (await getSession(id)) ?? emptySession(id);
  const saved = await putSession(id, {
    ...existing,
    answers: body.answers ?? existing.answers,
    reasons: body.reasons ?? existing.reasons,
    rules: body.rules ?? existing.rules,
    verified: body.verified ?? existing.verified,
    summary: body.summary === undefined ? existing.summary : body.summary,
    consent: body.consent ?? existing.consent,
    history: body.history ?? existing.history,
    unchecked: body.unchecked ?? existing.unchecked,
    created_at: existing.created_at,
  });
  return Response.json(saved);
}
