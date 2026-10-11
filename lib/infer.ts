import type { Answers, Verification } from "./types";

export type Inference = {
  band: [number | null, number | null];
  revShift: number;
  expFlip: number;
  costDrop: number;
  expDrop: number;
  noise: number;
};

export function infer(a: Answers): Inference | null {
  const pts = [
    { d: 0, v: a.cost_1 },
    { d: 50, v: a.cost_2 },
    { d: 250, v: a.cost_3 },
    ...(a.cost_3b != null ? [{ d: 1000, v: a.cost_3b }] : []),
  ].filter((p) => p.v != null);

  if (pts.length === 0) return null;

  const i = pts.findIndex((p) => p.v <= 3);
  const band: [number | null, number | null] =
    i === 0 ? [0, 0] : i > 0 ? [pts[i - 1].d, pts[i].d] : [pts.at(-1)!.d, null];

  return {
    band,
    revShift: a.rev_yes - a.rev_no,
    expFlip: [a.exp_private, a.exp_manager, a.exp_customer].findIndex((v) => v <= 3),
    costDrop: pts[0].v - pts.at(-1)!.v,
    expDrop: a.exp_private - a.exp_customer,
    noise: Math.abs(a.ctrl_a - a.ctrl_b),
  };
}

export function resolveInference(answers: Answers, verified: Record<string, Verification> | undefined): Inference | null {
  const raw = infer(answers);
  if (!raw) return null;
  const stated = verified?.no_limit?.band;
  return {
    ...raw,
    band: stated ?? raw.band,
    noise: verified?.noise?.noiseDismissed ? 0 : raw.noise,
  };
}

export function activeFindings(r: Inference) {
  const f: string[] = [];
  if (r.expDrop > r.costDrop && r.expDrop >= 2) f.push("exposure_over_cost");
  if (r.revShift >= 1) f.push("reversibility");
  if (r.band[1] != null && r.band[0] !== r.band[1]) f.push("money_band");
  else if (r.band[1] == null) f.push("cost_not_the_boundary");
  if (r.expFlip === 2) f.push("internal_ok_external_not");
  if (r.noise >= 2) f.push("noisy_caveat");
  return f.slice(0, 4);
}
