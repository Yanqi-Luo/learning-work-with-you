import type { Inference } from "./infer";
import type { Answers } from "./types";

export type Driver = {
  k: "exposure" | "reversibility" | "cost";
  label: string;
  effect: number;
};

export type Archetype = {
  name: string;
  line: string;
  modifier: string | null;
  drivers: Driver[];
  mean: number;
  tellRate: number;
};

const TYPES: Record<string, { name: string; line: string }> = {
  exposure_hi: { name: "The Diplomat", line: "Move fast — but never speak for me." },
  exposure_lo: { name: "The Guardian", line: "Check with me before anyone else sees it." },
  reversibility_hi: { name: "The Tinkerer", line: "If I can undo it, go." },
  reversibility_lo: { name: "The Surgeon", line: "Reversible is yours. Permanent is mine." },
  cost_hi: { name: "The Pilot", line: "I'll take the big calls. You handle the rest." },
  cost_lo: { name: "The Treasurer", line: "Watch what it costs." },
};

export function answerStats(answers: Answers) {
  const vals = Object.values(answers).filter((value): value is number => typeof value === "number");
  const mean = vals.length ? vals.reduce((sum, value) => sum + value, 0) / vals.length : 0;
  const acted = vals.filter((value) => value >= 4);
  const tellRate = acted.length ? vals.filter((value) => value === 4).length / acted.length : 0;
  return { vals, mean, tellRate };
}

export function archetype(result: Inference, answers: Answers): Archetype | null {
  const { vals, mean, tellRate } = answerStats(answers);
  if (vals.length === 0) return null;

  const drivers: Driver[] = [
    { k: "exposure", label: "Who else sees it", effect: result.expDrop },
    { k: "reversibility", label: "Can it be undone", effect: result.revShift },
    { k: "cost", label: "What it costs", effect: result.costDrop },
  ];
  drivers.sort((a, b) => b.effect - a.effect);

  const type = TYPES[`${drivers[0].k}_${mean >= 3.5 ? "hi" : "lo"}`];
  const modifier = tellRate > 0.6 ? "who wants receipts" : tellRate < 0.2 ? "who'd rather not be bothered" : null;
  return { ...type, modifier, drivers, mean, tellRate };
}

export function driverWidths(drivers: Driver[]) {
  const max = Math.max(...drivers.map((driver) => driver.effect));
  const min = Math.min(...drivers.map((driver) => driver.effect));
  if (max === min) return drivers.map((driver) => ({ ...driver, width: 1 }));
  return drivers.map((driver) => ({ ...driver, width: (driver.effect - min) / (max - min) }));
}
