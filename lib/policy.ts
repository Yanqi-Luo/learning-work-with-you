import { answerStats } from "./archetype";
import type { Inference } from "./infer";
import { moveFromText, normalizeInstruction } from "./instruction";
import type { Answers, Rule, RuleMove } from "./types";

export type PolicyGroup = "act" | "show" | "ask" | "always" | "history";

export type PolicyItem = {
  id: string;
  move: RuleMove;
  text: string;
  source: string;
  group: PolicyGroup;
  dimension: "cost" | "reversibility" | "exposure" | "notification" | "custom";
  when?: Record<string, unknown>;
  modifier?: { shift_steps: number };
  detail: string;
  raw?: string;
};

const money = (n: number) => `$${n.toLocaleString("en-US")}`;

const EXP = [
  "writing anything down for me",
  "messaging anyone outside my own notes",
  "messaging anyone outside my team",
];

function sourceLabel(rule: Rule) {
  if (rule.source === "spoken") return "you told me";
  if (rule.source === "corrected") return "you corrected this";
  if (rule.source === "history") return "from your history";
  return "confirmed by you";
}

function groupFor(move: RuleMove, source: string): PolicyGroup {
  if (source === "from your history") return "history";
  if (move === "show") return "show";
  if (move === "ask" || move === "custom") return "ask";
  if (move === "modifier") return "always";
  return "act";
}

const CLAIM_KEYS: Record<string, string[]> = {
  money_hi: ["claim:money"],
  money_any: ["claim:money"],
  exposure: ["claim:exposure"],
  exposure_ok: ["claim:exposure"],
  reversibility: ["claim:reversibility"],
};

function dimensionFor(rule: Rule): PolicyItem["dimension"] {
  const key = rule.key ?? "";
  if (key.includes("reversib")) return "reversibility";
  if (key.includes("exposure")) return "exposure";
  if (key.includes("money") || key.includes("cost")) return "cost";
  if (key.includes("notif") || key.includes("no_trust")) return "notification";
  return "custom";
}

function presentRule(rule: Rule) {
  const evidence = (rule.raw ?? rule.text).trim().replace(/\.$/, "");
  const text = normalizeInstruction(rule.text).replace(/\.$/, "");
  return { text, raw: evidence.toLowerCase() === text.toLowerCase() ? undefined : evidence };
}

function claimRule(rules: Rule[], id: string) {
  const keys = new Set([id, `claim:${id}`, ...(CLAIM_KEYS[id] ?? [])]);
  return rules.find((rule) => rule.key != null && keys.has(rule.key));
}

export function policyItems(result: Inference, answers: Answers, rules: Rule[]): PolicyItem[] {
  const items: PolicyItem[] = [];
  const used = new Set<string>();
  const { tellRate } = answerStats(answers);

  const push = (item: Omit<PolicyItem, "group" | "detail"> & { detail?: string }) => {
    const override = claimRule(rules, item.id);
    const spoken = override ? presentRule(override) : null;
    const text = spoken?.text ?? item.text;
    const move = spoken ? moveFromText(spoken.text) : item.move;
    const source = override ? sourceLabel(override) : item.source;
    if (override?.key) used.add(override.key);
    items.push({
      ...item,
      text,
      raw: spoken?.raw,
      source,
      group: groupFor(move, source),
      move,
      modifier: move === "modifier" ? item.modifier : undefined,
      detail: item.detail ?? "Treat this as a standing instruction.",
    });
  };

  const [lo, hi] = result.band;
  if (lo != null && lo > 0) {
    push({
      id: "money_lo",
      move: "act",
      text: `Go ahead on purchases under ${money(lo)}`,
      source: "learned",
      dimension: "cost",
      when: { action: "purchase", amount_lt: lo },
      detail: "Small purchases can go through without a check.",
    });
  }
  if (hi != null && lo != null && lo !== hi) {
    push({
      id: "money_mid",
      move: "show",
      text: `Show me options between ${money(lo)} and ${money(hi)}`,
      source: "learned",
      dimension: "cost",
      when: { action: "purchase", amount_between: [lo, hi] },
      detail: "Bring the choice back before anything is spent.",
    });
  }
  if (hi != null && hi > 0) {
    push({
      id: "money_hi",
      move: "ask",
      text: `Ask me before spending over ${money(hi)}`,
      source: "learned",
      dimension: "cost",
      when: { action: "purchase", amount_gt: hi },
      detail: "Do not spend past this line on your own.",
    });
  } else if (hi == null) {
    push({
      id: "money_any",
      move: "act",
      text: "Cost alone is not my boundary",
      source: "learned",
      dimension: "cost",
      when: { action: "purchase" },
      detail: "The amounts in this test were not where you asked AI to stop.",
    });
  } else if (lo === 0 && hi === 0) {
    push({
      id: "money_hi",
      move: "ask",
      text: "Ask me before spending almost any amount",
      source: "learned",
      dimension: "cost",
      when: { action: "purchase", amount_gt: 0 },
      detail: "You want a say on almost any amount.",
    });
  }

  if (result.expFlip >= 0 && result.expFlip < EXP.length) {
    const recipient = result.expFlip === 0 ? "any_written" : result.expFlip === 1 ? "outside_notes" : "external";
    push({
      id: "exposure",
      move: "ask",
      text: `Ask before ${EXP[result.expFlip]}`,
      source: "learned",
      dimension: "exposure",
      when: { recipient },
      detail: "Do not speak for me until I have seen it.",
    });
  } else {
    push({
      id: "exposure_ok",
      move: "act",
      text: "Messaging on my behalf is fine",
      source: "learned",
      dimension: "exposure",
      when: { recipient: "any" },
      detail: "You were comfortable with the messages in this test.",
    });
  }

  if (result.revShift >= 1) {
    push({
      id: "reversibility",
      move: "modifier",
      text: "Treat anything that cannot be undone as one step more cautious",
      source: "learned",
      dimension: "reversibility",
      when: { reversible: false },
      modifier: { shift_steps: -1 },
      detail: "If it cannot be undone, slow down.",
    });
  }

  if (tellRate > 0.6) {
    push({
      id: "notify",
      move: "act",
      text: "Tell me afterwards when you act on your own",
      source: "learned",
      dimension: "notification",
      detail: "Go ahead, then leave a short note of what you did.",
    });
  }
  if (tellRate < 0.2 && Object.keys(answers).length > 0) {
    push({
      id: "quiet",
      move: "act",
      text: "Don't narrate routine work — just do it",
      source: "learned",
      dimension: "notification",
      detail: "Skip the play-by-play on ordinary tasks.",
    });
  }

  for (const rule of rules) {
    if (rule.key && used.has(rule.key)) continue;
    if (rule.key && items.some((item) => item.id === rule.key || `claim:${item.id}` === rule.key)) continue;
    const spoken = presentRule(rule);
    const move = moveFromText(spoken.text);
    const source = sourceLabel(rule);
    items.push({
      id: rule.key ?? `rule:${rule.created_at}:${rule.text}`,
      move,
      text: spoken.text,
      raw: spoken.raw,
      source,
      group: groupFor(move, source),
      dimension: dimensionFor(rule),
      detail: "This is a rule you added yourself.",
    });
  }

  return dedupePolicies(items);
}

function sentenceKey(text: string) {
  return text.trim().replace(/[.]+$/, "").toLowerCase();
}

function dedupePolicies(items: PolicyItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = sentenceKey(item.text);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const GROUP_LABELS: Record<PolicyGroup, string> = {
  act: "Go ahead",
  show: "Show me first",
  ask: "Ask me",
  always: "Always applies",
  history: "From your history",
};

export const GROUP_ORDER: PolicyGroup[] = ["act", "show", "ask", "always", "history"];
