import type { Inference } from "./infer";
import type { Answers, RuleMove } from "./types";

export type ClaimType = "yesno" | "threshold" | "chips";

export type Claim = {
  id: string;
  type: ClaimType;
  text: string;
  chips: string[];
  placeholder?: string;
  escape?: string;
  yesText?: string;
};

export function claims(r: Inference, answers: Answers): Claim[] {
  const c: Claim[] = [];
  const vals = Object.values(answers).filter((value): value is number => typeof value === "number");
  const allHigh = vals.length > 0 && vals.every((value) => value >= 4);
  const allLow = vals.length > 0 && vals.every((value) => value <= 2);

  if (allHigh)
    c.push({
      id: "no_limit",
      type: "threshold",
      text: "You said go ahead to everything I showed you — including a $1,000 booking you couldn't cancel. Is there an amount where you'd want to be asked first?",
      chips: [],
      placeholder: "$",
      escape: "No, I genuinely wouldn't need asking",
    });

  if (allLow)
    c.push({
      id: "no_trust",
      type: "chips",
      text: "You wanted to be asked about everything — even a note only you would read. Is there anything small enough that you'd rather I just did?",
      chips: ["Notes to myself", "Scheduling", "Research and drafts", "Nothing, really"],
    });

  if (r.noise >= 2)
    c.push({
      id: "noise",
      type: "chips",
      text: "Two of those situations were almost identical and you answered them differently. Was one a slip, or is there a difference I missed?",
      chips: ["One was a slip", "There is a difference", "Not sure"],
    });

  if (r.expFlip >= 1)
    c.push({
      id: "exposure",
      type: "yesno",
      text: "You want approval before AI sends anything to another person — is that right?",
      chips: ["Only professional ones", "Only important ones", "Depends who it is", "Something else"],
    });

  if (r.revShift >= 1)
    c.push({
      id: "reversibility",
      type: "yesno",
      text: "You're happy for AI to act whenever something can be undone, even with money involved — right?",
      chips: ["Only up to a point", "Depends on the amount", "Depends on the domain", "Something else"],
    });

  if (r.band[1])
    c.push({
      id: "money",
      type: "yesno",
      text: `You'd want to be asked about anything over about $${r.band[1]} — is that right?`,
      chips: ["Lower than that", "Higher than that", "Depends what it is", "Something else"],
    });

  const backups: Claim[] = [
    {
      id: "exposure",
      type: "yesno",
      text: "Does it matter to you whether someone else sees what AI does?",
      chips: ["Only sometimes", "It depends", "Something else"],
      yesText: "Who else sees it changes what you want AI to do.",
    },
    {
      id: "reversibility",
      type: "yesno",
      text: "Does it matter whether something can be undone?",
      chips: ["Only sometimes", "It depends", "Something else"],
      yesText: "Whether something can be undone changes what you want AI to do.",
    },
    {
      id: "cost",
      type: "yesno",
      text: "Does the amount of money involved change your answer?",
      chips: ["Only sometimes", "It depends", "Something else"],
      yesText: "The amount of money changes what you want AI to do.",
    },
  ];
  for (const backup of backups) {
    if (c.length >= 2) break;
    if (c.some((item) => item.id === backup.id)) continue;
    c.push(backup);
  }

  return c.slice(0, 2);
}

export function confirmedRule(id: "exposure" | "reversibility" | "money", band: Inference["band"]) {
  if (id === "exposure") return "Ask before AI sends anything to another person.";
  if (id === "reversibility") return "Go ahead when something can be undone, even when money is involved.";
  return `Ask about anything over about $${band[1]}.`;
}

export function autonomyRule(chip: string): { text: string; move: RuleMove } {
  if (chip === "Notes to myself") return { text: "Go ahead on notes only I would read.", move: "act" };
  if (chip === "Scheduling") return { text: "Go ahead on scheduling.", move: "act" };
  if (chip === "Research and drafts") return { text: "Go ahead on research and drafts.", move: "act" };
  return { text: "Keep asking me, even for small things.", move: "ask" };
}
