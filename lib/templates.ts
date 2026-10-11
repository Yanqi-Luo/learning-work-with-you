import type { Finding, Narration } from "./types";
import type { Inference } from "./infer";

export type NarrateInput = {
  active_findings: string[];
  band: [number | null, number | null];
  rev_shift: number;
  exp_flip: number;
  cost_drop: number;
  exp_drop: number;
  noise: number;
  answersKey: string;
};

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

function finding(key: string, input: NarrateInput): Finding {
  const [lo, hi] = input.band;
  switch (key) {
    case "exposure_over_cost":
      return {
        h: "You care more about who else sees it than about what it costs.",
        b: "When another person was involved, you wanted more of a check than you did as the amounts grew.",
      };
    case "reversibility":
      return {
        h: "Reversibility earns AI a lot more freedom.",
        b: "The same kind of change got more cautious once it could not be undone.",
      };
    case "money_band": {
      const low = lo ?? 0;
      const high = hi ?? low;
      return {
        h: low === 0 ? "You want a say on almost any amount." : `Your money line sits between ${money(low)} and ${money(high)}.`,
        b: low === 0 ? "Even the smallest amounts were enough for you to want a check." : `Under ${money(low)} you let AI act. At ${money(high)} you wanted a check.`,
      };
    }
    case "cost_not_the_boundary":
      return {
        h: "Cost was not where you drew the line.",
        b: lo == null ? "You said the amount isn't what you'd want to be asked about." : `Through ${money(lo)}, you still let AI go ahead.`,
      };
    case "internal_ok_external_not":
      return {
        h: "A manager was fine. A customer was not.",
        b: "You allowed the message inside the company, and wanted a check before a customer saw it.",
      };
    case "noisy_caveat":
      return {
        h: "Two similar choices didn't match.",
        b: "The paired hotel changes didn't line up, so treat this as a rough read.",
      };
    default:
      return { h: key, b: "" };
  }
}

function summaryFor(input: NarrateInput) {
  const parts: string[] = [];
  if (input.active_findings.includes("reversibility")) {
    parts.push("You want AI to move faster when a mistake can be undone");
  }
  if (input.active_findings.includes("exposure_over_cost") || input.active_findings.includes("internal_ok_external_not")) {
    parts.push("you draw a line around actions that reach other people");
  }
  if (input.active_findings.includes("money_band")) {
    const low = input.band[0] ?? 0;
    const high = input.band[1] ?? low;
    parts.push(low === 0 ? "you want a say on almost any amount" : `your money line sits between ${money(low)} and ${money(high)}`);
  }
  if (input.active_findings.includes("cost_not_the_boundary")) {
    parts.push("the amounts in this test were not where you asked AI to stop");
  }
  if (parts.length === 0) return "A few of your answers are in. There isn't a stable line yet.";
  const sentence = parts.join(", and ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}

export function templateNarration(input: NarrateInput): Narration {
  return {
    summary: summaryFor(input),
    findings: input.active_findings.map((key) => finding(key, input)),
    answersKey: input.answersKey,
  };
}

export function narrateInput(r: Inference, findings: string[], key: string): NarrateInput {
  return {
    active_findings: findings,
    band: r.band,
    rev_shift: r.revShift,
    exp_flip: r.expFlip,
    cost_drop: r.costDrop,
    exp_drop: r.expDrop,
    noise: r.noise,
    answersKey: key,
  };
}
