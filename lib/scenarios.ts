import type { Scenario } from "./types";

export const SCENARIOS: Scenario[] = [
  {
    id: "cost_1",
    dim: "cost",
    delta: 0,
    icon: "✈",
    text: "You're taking a weekend trip. Your AI finds a hotel matching your usual preferences and budget. It can reserve it now with free cancellation until tomorrow.",
  },
  {
    id: "exp_private",
    dim: "exposure",
    level: 1,
    icon: "✎",
    text: "Your AI drafts a note summarising a difficult work decision for your own private notes. No one else will see it.",
  },
  {
    id: "rev_yes",
    dim: "reversibility",
    reversible: true,
    icon: "✈",
    text: "Your flight is delayed. Your AI finds a nonstop replacement $80 more. The new ticket is fully refundable for 24 hours.",
  },
  {
    id: "cost_2",
    dim: "cost",
    delta: 50,
    icon: "✈",
    text: "That hotel is sold out. Your AI finds a better-rated alternative that costs $50 more, still fully refundable until tomorrow.",
  },
  {
    id: "exp_manager",
    dim: "exposure",
    level: 2,
    icon: "✉",
    text: "Your AI drafts a message to your manager explaining a project will be delivered a day late. The facts are accurate and the tone matches your usual style.",
  },
  {
    id: "ctrl_a",
    dim: "control",
    pair: "ctrl",
    icon: "✈",
    text: "Your AI can switch your hotel to a refundable option for $40 more.",
  },
  {
    id: "cost_3",
    dim: "cost",
    delta: 250,
    adaptive: "cost_3b",
    icon: "✈",
    text: "Your AI finds a much better hotel that costs $250 more than your original option, still fully refundable until tomorrow.",
  },
  {
    id: "rev_no",
    dim: "reversibility",
    reversible: false,
    icon: "✈",
    text: "Your flight is delayed. Your AI finds a nonstop replacement $80 more. This time the new ticket is non-refundable once booked.",
  },
  {
    id: "exp_customer",
    dim: "exposure",
    level: 3,
    icon: "✉",
    text: "Your AI drafts a message to a customer explaining their delivery will be delayed. The information is accurate and it follows your usual style.",
  },
  {
    id: "ctrl_b",
    dim: "control",
    pair: "ctrl",
    icon: "✈",
    text: "Your AI finds an alternative hotel with free cancellation that costs $40 more.",
  },
];

export const COST_3B: Scenario = {
  id: "cost_3b",
  dim: "cost",
  delta: 1000,
  icon: "✈",
  text: "Your AI finds an exceptional hotel that costs $1,000 more than your original option, still fully refundable until tomorrow.",
};

export const CHOICES = [
  { v: 5, label: "Go ahead", sub: "Do it without checking." },
  { v: 4, label: "Go ahead, then tell me", sub: "Do it, let me know after." },
  { v: 3, label: "Show me first", sub: "Prepare it, let me approve." },
  { v: 2, label: "Ask me", sub: "Don't assume — check with me." },
  { v: 1, label: "Don't do this", sub: "Not with AI." },
];

export const CHIPS = [
  "Cost",
  "Easy to undo",
  "Hard to undo",
  "Other people",
  "Privacy",
  "Uncertainty",
  "Something else",
];

export function domainLabel(scenario: Scenario) {
  if (scenario.dim === "exposure") return scenario.id === "exp_private" ? "Notes" : "Messages";
  return "Travel";
}

export function scenarioQueue(answers: Record<string, number>): Scenario[] {
  const queue: Scenario[] = [];
  for (const scenario of SCENARIOS) {
    queue.push(scenario);
    if (scenario.id === "cost_3" && (answers.cost_3 ?? 0) >= 4) queue.push(COST_3B);
  }
  return queue;
}
