import { moveFromText, normalizeInstruction } from "./instruction";
import type { PolicyItem } from "./policy";
import { emptyHistory, type HistoryFinding, type HistoryState, type Rule, type Session } from "./types";

const DIMENSIONS = new Set(["cost", "reversibility", "exposure", "notification", "communication"]);
const DIRECTIONS = new Set(["more_autonomy", "less_autonomy", "style"]);
const STRENGTHS = new Set(["weak", "medium", "strong"]);

const HEADLINES: Record<string, Partial<Record<HistoryFinding["dimension"], string>>> = {
  wants_less_confirmation: {
    cost: "You rarely want confirmation on small costs",
    reversibility: "You rarely want confirmation when something can be undone",
    exposure: "You rarely want confirmation before someone else sees it",
    notification: "You rarely want a check on routine updates",
  },
  wants_more_confirmation: {
    cost: "You want a check before money is spent",
    reversibility: "You want a check when something cannot be undone",
    exposure: "You want a check before anyone else sees it",
    notification: "You want to be asked more often",
  },
  reviews_output: {
    cost: "You review what AI produces before it counts",
    reversibility: "You review AI output before it sticks",
    exposure: "You review AI output before anyone else sees it",
    notification: "You review AI output before it moves on",
  },
  undoes_actions: {
    cost: "You undo AI actions that involve money",
    reversibility: "You undo AI actions that cannot be taken back",
    exposure: "You undo AI actions that reach other people",
    notification: "You undo AI actions often enough to want a check",
  },
};

export function fingerprint(finding: Pick<HistoryFinding, "signal" | "quote">) {
  return `${finding.signal}:${finding.quote.trim().toLowerCase()}`;
}

export function findingHeadline(finding: HistoryFinding) {
  const known = HEADLINES[finding.signal]?.[finding.dimension];
  if (known) return known;
  if (/short/.test(finding.signal)) return "You prefer shorter answers";
  if (/long|detail/.test(finding.signal)) return "You prefer more detailed answers";
  if (/simpl/.test(finding.signal)) return "You prefer simpler answers";
  if (/source/.test(finding.signal)) return "You want sources";
  if (/reason/.test(finding.signal)) return "You want the reasoning";
  if (/option/.test(finding.signal)) return "You want options, not a single answer";
  if (/tone|format/.test(finding.signal)) return "You correct tone and format";
  if (finding.dimension === "communication") return "You have a preference for how AI communicates";
  return "A pattern in how you use AI";
}

export function parseFindings(value: unknown): HistoryFinding[] {
  if (!value || typeof value !== "object" || !("findings" in value) || !Array.isArray(value.findings)) return [];
  return value.findings.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const finding = item as Partial<HistoryFinding>;
    const signal = String(finding.signal ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
    if (signal.length < 2) return [];
    if (!finding.dimension || !DIMENSIONS.has(finding.dimension)) return [];
    if (!finding.direction || !DIRECTIONS.has(finding.direction)) return [];
    if (!finding.strength || !STRENGTHS.has(finding.strength)) return [];
    const quote = String(finding.quote ?? "").trim();
    if (!quote) return [];
    return [
      {
        signal,
        dimension: finding.dimension,
        direction: finding.direction,
        quote: quote.split(/\s+/).slice(0, 20).join(" "),
        strength: finding.strength,
        ...(typeof finding.mentions === "number" && finding.mentions > 1 ? { mentions: Math.min(99, Math.round(finding.mentions)) } : {}),
      },
    ];
  });
}

export function findingMove(finding: HistoryFinding): Rule["move"] {
  if (finding.direction === "style" || finding.dimension === "communication") return "custom";
  if (finding.signal === "reviews_output") return "show";
  if (finding.direction === "less_autonomy" || finding.signal === "undoes_actions") return "ask";
  return "act";
}

export function conflictsWith(finding: HistoryFinding, items: PolicyItem[]): PolicyItem | null {
  if (finding.direction === "style" || finding.dimension === "communication") return null;
  const same = items.filter((item) => item.dimension === finding.dimension);
  if (finding.direction === "more_autonomy") {
    return same.find((item) => item.move === "ask" || item.move === "modifier") ?? null;
  }
  return same.find((item) => item.move === "act") ?? null;
}

function historyOf(session: Session): HistoryState {
  return session.history ?? emptyHistory();
}

function withoutProposal(history: HistoryState, finding: HistoryFinding): HistoryFinding[] {
  const id = fingerprint(finding);
  return history.proposals.filter((item) => fingerprint(item) !== id);
}

export function rememberFindings(session: Session, findings: HistoryFinding[]): Session {
  const history = historyOf(session);
  const rejected = new Set(history.rejected);
  const seen = new Set(history.proposals.map(fingerprint));
  const proposals = [...history.proposals];
  for (const finding of findings) {
    const id = fingerprint(finding);
    if (rejected.has(id) || seen.has(id)) continue;
    seen.add(id);
    proposals.push(finding);
  }
  return { ...session, history: { ...history, proposals } };
}

export function decideFinding(
  session: Session,
  finding: HistoryFinding,
  decision: "add" | "ignore" | "ask" | "keep" | "update",
  conflict?: PolicyItem | null,
): Session {
  const history = historyOf(session);
  const id = fingerprint(finding);
  const proposals = withoutProposal(history, finding);
  const now = new Date().toISOString();

  if (decision === "ignore" || decision === "keep") {
    return {
      ...session,
      history: { ...history, proposals, rejected: [...history.rejected, id] },
    };
  }

  if (decision === "ask") {
    return {
      ...session,
      history: {
        ...history,
        proposals,
        pending: [
          ...history.pending.filter((item) => item.id !== `history:${id}`),
          {
            id: `history:${id}`,
            text: `${findingHeadline(finding)} — is that right?`,
            chips: ["Only sometimes", "It depends", "Something else"],
          },
        ],
      },
    };
  }

  const instruction = normalizeInstruction(findingHeadline(finding));
  const rule: Rule = {
    text: instruction,
    raw: finding.quote,
    source: "history",
    created_at: now,
    key: decision === "update" && conflict ? conflict.id : `history:${id}`,
    move: moveFromText(instruction),
  };
  const rules =
    decision === "update" && conflict
      ? [...session.rules.filter((item) => item.key !== conflict.id && item.key !== `claim:${conflict.id}`), rule]
      : [...session.rules.filter((item) => item.key !== rule.key), rule];

  return { ...session, rules, history: { ...history, proposals } };
}

export function dropPending(session: Session, claimId: string): HistoryState {
  const history = historyOf(session);
  return { ...history, pending: history.pending.filter((item) => item.id !== claimId) };
}

const TEXT_CAP = 12000;

function pushText(parts: string[], value: unknown) {
  if (typeof value !== "string") return;
  const text = value.trim();
  if (text) parts.push(text);
}

function collectMessages(node: unknown, parts: string[]) {
  if (!node || typeof node !== "object" || parts.join("\n").length >= TEXT_CAP) return;
  if (Array.isArray(node)) {
    for (const item of node) collectMessages(item, parts);
    return;
  }
  const record = node as Record<string, unknown>;
  const mapping = record.mapping;
  if (mapping && typeof mapping === "object") {
    for (const item of Object.values(mapping as Record<string, unknown>)) {
      if (!item || typeof item !== "object") continue;
      const message = (item as { message?: { content?: { parts?: unknown[]; text?: unknown } } }).message;
      const content = message?.content;
      if (Array.isArray(content?.parts)) {
        for (const part of content.parts) pushText(parts, part);
      }
      pushText(parts, content?.text);
    }
  }
  const chats = record.chat_messages;
  if (Array.isArray(chats)) {
    for (const message of chats) {
      if (!message || typeof message !== "object") continue;
      const chat = message as { text?: unknown; content?: unknown };
      pushText(parts, chat.text);
      if (Array.isArray(chat.content)) {
        for (const block of chat.content) {
          if (block && typeof block === "object" && "text" in block) pushText(parts, (block as { text?: unknown }).text);
        }
      }
    }
  }
  if (Array.isArray(record.conversations)) collectMessages(record.conversations, parts);
}

function countPlainTurns(text: string) {
  const roleTurns = text.split(/\n(?=(?:user|human|assistant|ai|chatgpt|claude)\s*:)/i).filter((part) => part.trim());
  if (roleTurns.length > 1) return roleTurns.length;
  const paragraphs = text.split(/\n\s*\n/).filter((part) => part.trim());
  return Math.max(1, paragraphs.length);
}

export function readConversation(raw: string): { text: string; messages: number } {
  const trimmed = raw.trim();
  if (!trimmed) return { text: "", messages: 0 };
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    const text = trimmed.slice(0, TEXT_CAP);
    return { text, messages: countPlainTurns(text) };
  }
  try {
    const parts: string[] = [];
    collectMessages(JSON.parse(trimmed), parts);
    const joined = parts.join("\n").trim();
    const text = (joined || trimmed).slice(0, TEXT_CAP);
    return { text, messages: joined ? parts.length : countPlainTurns(text) };
  } catch {
    const text = trimmed.slice(0, TEXT_CAP);
    return { text, messages: countPlainTurns(text) };
  }
}

export function conversationText(raw: string) {
  return readConversation(raw).text;
}

const LOCAL_CUES: { re: RegExp; signal: string; dimension: HistoryFinding["dimension"]; direction: HistoryFinding["direction"] }[] = [
  { re: /\b(make (that|it|this) shorter|shorter|more concise|too long)\b/i, signal: "wants_shorter", dimension: "communication", direction: "style" },
  { re: /\b(more detail|more detailed|in more depth|expand on)\b/i, signal: "wants_longer", dimension: "communication", direction: "style" },
  { re: /\b(simpler|plain language|easier to read)\b/i, signal: "wants_simpler", dimension: "communication", direction: "style" },
  { re: /\b(sources?|citations?|cite your)\b/i, signal: "wants_sources", dimension: "communication", direction: "style" },
  { re: /\b(show your reasoning|explain your reasoning|why did you)\b/i, signal: "wants_reasoning", dimension: "communication", direction: "style" },
  { re: /\b(give me options|a few options|some alternatives)\b/i, signal: "wants_options", dimension: "communication", direction: "style" },
  { re: /\b(too formal|too casual|change the tone|wrong format)\b/i, signal: "corrected_tone", dimension: "communication", direction: "style" },
  { re: /\b(just do it|go ahead|don'?t ask( me)?|stop asking)\b/i, signal: "wants_less_confirmation", dimension: "notification", direction: "more_autonomy" },
  { re: /\b(ask me first|check with me first|check first|don'?t (do|send) (that|this))\b/i, signal: "wants_more_confirmation", dimension: "notification", direction: "less_autonomy" },
];

function quoteFrom(line: string, match: string) {
  const words = line.trim().split(/\s+/);
  const index = words.findIndex((_, i) => words.slice(i).join(" ").toLowerCase().includes(match.toLowerCase()));
  const start = Math.max(0, index < 0 ? 0 : index);
  return words.slice(start, start + 20).join(" ");
}

/** Used only when no model is configured, so a pasted conversation still yields proposals. */
export function localFindings(text: string): HistoryFinding[] {
  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const grouped = new Map<string, { cue: (typeof LOCAL_CUES)[number]; quotes: string[] }>();
  for (const line of lines) {
    for (const cue of LOCAL_CUES) {
      const match = line.match(cue.re);
      if (!match) continue;
      const current = grouped.get(cue.signal) ?? { cue, quotes: [] };
      current.quotes.push(quoteFrom(line, match[0]));
      grouped.set(cue.signal, current);
      break;
    }
  }
  return [...grouped.values()].slice(0, 8).map(({ cue, quotes }) => ({
    signal: cue.signal,
    dimension: cue.dimension,
    direction: cue.direction,
    quote: quotes[0].split(/\s+/).slice(0, 20).join(" "),
    strength: quotes.length >= 4 ? "strong" : quotes.length >= 2 ? "medium" : "weak",
    ...(quotes.length > 1 ? { mentions: quotes.length } : {}),
  }));
}
