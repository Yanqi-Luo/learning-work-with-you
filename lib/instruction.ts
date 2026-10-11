import type { RuleMove } from "./types";

function finish(text: string) {
  let sentence = text.trim().replace(/[.?!]+$/, "");
  if (!sentence) return "";
  sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  const words = sentence.split(/\s+/);
  if (words.length > 14) sentence = words.slice(0, 14).join(" ");
  return `${sentence}.`;
}

/** Imperative instruction addressed to the AI. Safe to run more than once. */
export function normalizeInstruction(input: string) {
  const text = input
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*[—–-]\s*(is that right\??|right\??)\s*$/i, "")
    .replace(/\s*\?\s*$/, "")
    .trim();
  if (!text) return "";

  const money = text.match(/\$\s*([\d,]+)/);
  if (money && /asked|ask|spending|spend/i.test(text)) {
    const amount = Number(money[1].replace(/,/g, ""));
    if (Number.isFinite(amount)) return `Ask me before spending more than $${amount.toLocaleString("en-US")}.`;
  }
  if (/sensitive/i.test(text) && /confirm|share|send|show/i.test(text)) {
    return "Confirm with me before sharing anything sensitive.";
  }
  if (/non-?reversible|can'?t be undone|cannot be undone/i.test(text) && /ask|confirm|check/i.test(text)) {
    return "Ask me first before anything that can't be undone.";
  }
  if (/^you prefer shorter answers\.?$/i.test(text)) return "Keep answers short.";
  if (/^you prefer more detailed answers\.?$/i.test(text)) return "Give me more detail.";
  if (/^you prefer simpler answers\.?$/i.test(text)) return "Use simpler wording.";
  if (/^you want sources\.?$/i.test(text)) return "Include sources.";
  if (/^you want the reasoning\.?$/i.test(text)) return "Show your reasoning.";
  if (/^you want options/i.test(text)) return "Give me options.";
  if (/^you correct tone/i.test(text) || /^you have a preference for how ai communicates\.?$/i.test(text)) {
    return "Match the tone and format I ask for.";
  }
  if (/^ask me before spending over /i.test(text)) {
    return finish(text.replace(/over /i, "more than "));
  }
  if (/^(ask me|ask before|go ahead|tell me|let me know|notify|show me|confirm |check |don't|do not|never|treat|always|keep |give me|include |use |match )/i.test(text)) {
    return finish(text);
  }
  if (/^you('d| would) want to be asked/i.test(text)) {
    return finish(text.replace(/^you('d| would) want to be asked/i, "Ask me"));
  }
  return finish(text);
}

export function moveFromText(text: string): RuleMove {
  const line = text.trim();
  if (/^(go ahead|you can|feel free)/i.test(line)) return "act";
  if (/^(tell me|let me know|notify)/i.test(line)) return "act";
  if (/^(show|draft|prepare)/i.test(line)) return "show";
  if (/^(ask|confirm|check)/i.test(line)) return "ask";
  if (/^(treat|apply|always)/i.test(line)) return "modifier";
  return "ask";
}
