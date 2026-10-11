export type Answers = Record<string, number>;

export type Reasons = {
  _text?: Record<string, string>;
} & Record<string, string[] | Record<string, string> | undefined>;

export type RuleMove = "act" | "show" | "ask" | "modifier" | "custom";

export type Rule = {
  text: string;
  raw?: string;
  source: "spoken" | "learned" | "corrected" | "history";
  created_at: string;
  key?: string;
  move?: RuleMove;
};

export type HistoryFinding = {
  signal: string;
  dimension: "cost" | "reversibility" | "exposure" | "notification" | "communication";
  direction: "more_autonomy" | "less_autonomy" | "style";
  quote: string;
  strength: "weak" | "medium" | "strong";
  mentions?: number;
};

export type PendingClaim = {
  id: string;
  text: string;
  chips: string[];
};

export type HistoryState = {
  rejected: string[];
  pending: PendingClaim[];
  proposals: HistoryFinding[];
};

export function emptyHistory(): HistoryState {
  return { rejected: [], pending: [], proposals: [] };
}

export type Verification = {
  answer: "yes" | "not_quite" | "depends" | "threshold" | "escape" | "chip";
  correction?: string;
  narrowed_from?: string;
  band?: [number | null, number | null];
  confidence?: number;
  basis?: { user_stated?: boolean };
  item?: string;
  status?: "verified";
  open?: boolean;
  noiseDismissed?: boolean;
};

export type Session = {
  id: string;
  created_at: string;
  updated_at: string;
  answers: Answers;
  reasons: Reasons;
  rules: Rule[];
  verified: Record<string, Verification>;
  summary: string | null;
  consent: boolean;
  history: HistoryState;
  unchecked: string[];
};

export type Finding = { h: string; b: string };

export type Narration = {
  summary: string;
  findings: Finding[];
  answersKey: string;
};

export type Scenario = {
  id: string;
  dim: "cost" | "exposure" | "reversibility" | "control";
  icon: string;
  text: string;
  delta?: number;
  level?: number;
  reversible?: boolean;
  pair?: string;
  adaptive?: string;
};

export function emptySession(id: string): Session {
  const now = new Date().toISOString();
  return {
    id,
    created_at: now,
    updated_at: now,
    answers: {},
    reasons: {},
    rules: [],
    verified: {},
    summary: null,
    consent: false,
    history: emptyHistory(),
    unchecked: [],
  };
}

export function answersKey(answers: Answers) {
  return JSON.stringify(Object.entries(answers).sort(([a], [b]) => a.localeCompare(b)));
}

export function parseNarration(summary: string | null, key: string): Narration | null {
  if (!summary) return null;
  try {
    const parsed = JSON.parse(summary) as Narration;
    if (parsed.answersKey !== key || !parsed.summary || !Array.isArray(parsed.findings)) return null;
    return parsed;
  } catch {
    return null;
  }
}
