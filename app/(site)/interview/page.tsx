"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/Mascot";
import { autonomyRule, claims, confirmedRule, type Claim } from "@/lib/claims";
import { moveFromText, normalizeInstruction } from "@/lib/instruction";
import { dropPending } from "@/lib/history";
import { infer, type Inference } from "@/lib/infer";
import { useSession } from "@/lib/session-client";
import type { Rule, Session } from "@/lib/types";

type SpeechResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

type BrowserSpeech = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type ChatMessage = {
  id: string;
  role: "ai" | "user";
  text: string;
  update?: { revised: string; narrowed_from: string };
};

function getRecognition(): BrowserSpeech | null {
  const w = window as Window & {
    webkitSpeechRecognition?: new () => BrowserSpeech;
    SpeechRecognition?: new () => BrowserSpeech;
  };
  const Ctor = w.webkitSpeechRecognition ?? w.SpeechRecognition;
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  return recognition;
}

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.98;
  const voice =
    window.speechSynthesis.getVoices().find((item) => item.lang.toLowerCase().startsWith("en")) ?? null;
  if (voice) utter.voice = voice;
  window.speechSynthesis.speak(utter);
}

function money(value: number) {
  return `$${value.toLocaleString("en-US")}`;
}

function closingText(tally: { updated: number; left: number; amount: number | null }) {
  const updated = tally.updated === 1 ? "1 thing" : `${tally.updated} things`;
  const left = tally.left === 1 ? "1 as it was" : `${tally.left} as they were`;
  const progress =
    tally.updated > 0 && tally.left > 0
      ? `I've updated ${updated} and left ${left}.`
      : tally.updated > 0
        ? `I've updated ${updated}.`
        : `I've left ${left}.`;
  const lines = ["Thanks — that helps.", progress];
  if (tally.amount != null) lines.push(`Got it — I'll ask you about anything over ${money(tally.amount)}.`);
  return lines.join("\n\n");
}

function keptText(current: Claim, inferred: Inference) {
  if (current.yesText) return current.yesText;
  if (current.id === "exposure" || current.id === "reversibility" || current.id === "money") {
    return confirmedRule(current.id, inferred.band);
  }
  return current.text.replace(/\s*[—–-]\s*(is that right\??|right\??)\s*$/i, "").replace(/\?$/, "");
}

function interpret(speech: string): "yes" | "not_quite" | "depends" | "free" {
  const s = speech
    .toLowerCase()
    .replace(/[^a-z'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^(it depends|depends)$/.test(s)) return "depends";
  if (/^(yes|yeah|yep|yup|correct|right|exactly)( that'?s right| i do| that is right)?$/.test(s)) return "yes";
  if (/^(no|nope|not quite|not really|not exactly)$/.test(s)) return "not_quite";
  return "free";
}

function TypeLine({ text, active, onDone }: { text: string; active: boolean; onDone: () => void }) {
  const [count, setCount] = useState(active ? 0 : text.length);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!active) {
      setCount(text.length);
      return;
    }
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || text.length === 0) {
      setCount(text.length);
      onDoneRef.current();
      return;
    }
    let i = 0;
    let finished = false;
    setCount(0);
    const timer = window.setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= text.length && !finished) {
        finished = true;
        window.clearInterval(timer);
        onDoneRef.current();
      }
    }, 24);
    return () => window.clearInterval(timer);
  }, [active, text]);

  const typing = active && count < text.length;
  return (
    <span>
      {active ? text.slice(0, count) : text}
      {typing ? <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-ink align-middle" /> : null}
    </span>
  );
}

export default function InterviewPage() {
  const { session, ready, save } = useSession();
  const pending = session?.history?.pending ?? [];
  const answeredCount = session ? Object.keys(session.answers).length : 0;
  const raw = session ? infer(session.answers) : null;
  const frozenList = useRef<Claim[] | null>(null);
  if (session && frozenList.current === null && ((raw && answeredCount >= 6) || pending.length > 0)) {
    const base = raw ? claims(raw, session.answers) : [];
    const extra: Claim[] = pending.map((item) => ({ id: item.id, type: "yesno", text: item.text, chips: item.chips }));
    const merged = [...extra];
    for (const claim of base) {
      if (merged.length >= 2) break;
      if (merged.some((item) => item.id === claim.id)) continue;
      merged.push(claim);
    }
    frozenList.current = merged.slice(0, 2);
  }
  const list = frozenList.current ?? [];
  const claimKey = list.map((claim) => claim.id).join(",");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingId, setTypingId] = useState<string | null>(null);
  const [canReply, setCanReply] = useState(false);
  const [phase, setPhase] = useState<"ask" | "correct" | "updated">("ask");
  const [answer, setAnswer] = useState<"not_quite" | "depends" | null>(null);
  const [chips, setChips] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [speechOk, setSpeechOk] = useState(true);
  const [showType, setShowType] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [amountInput, setAmountInput] = useState("");
  const [chipChoice, setChipChoice] = useState<string | null>(null);
  const indexRef = useRef(0);
  const started = useRef(false);
  const finishedTyping = useRef(new Set<string>());
  const recognition = useRef<BrowserSpeech | null>(null);
  const listeningRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const listRef = useRef(list);
  const resultRef = useRef(raw);
  const sessionRef = useRef(session);
  const tally = useRef({ updated: 0, left: 0, amount: null as number | null });
  listRef.current = list;
  resultRef.current = raw;
  sessionRef.current = session;

  useEffect(() => {
    setSpeechOk(Boolean(getRecognition()));
    window.speechSynthesis?.getVoices();
  }, []);

  useEffect(() => {
    if (!ready || !claimKey || started.current) return;
    started.current = true;
    const intro = "I have a few assumptions I'd like to check.";
    setMessages([{ id: "intro", role: "ai", text: intro }]);
    setTypingId("intro");
  }, [ready, claimKey]);

  useEffect(() => {
    if (!typingId) return;
    const message = messages.find((item) => item.id === typingId);
    if (message?.role === "ai" && message.text) speak(message.text);
    return () => window.speechSynthesis?.cancel();
    // Speak once per new line. The message list is only read for that id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typingId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, text, canReply, phase]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  function finishTyping(id: string) {
    if (finishedTyping.current.has(id)) return;
    finishedTyping.current.add(id);
    const claimsNow = listRef.current;

    if (id === "intro") {
      const claim = claimsNow[0];
      if (!claim) return;
      setMessages((prev) => [...prev, { id: `claim-${claim.id}`, role: "ai", text: claim.text }]);
      setTypingId(`claim-${claim.id}`);
      return;
    }

    if (id.startsWith("claim-") || id.startsWith("follow-")) {
      setCanReply(true);
      return;
    }

    if (id.startsWith("ack-")) {
      const next = indexRef.current + 1;
      if (next >= claimsNow.length) {
        setMessages((prev) => [...prev, { id: "done", role: "ai", text: closingText(tally.current) }]);
        setTypingId("done");
        return;
      }
      indexRef.current = next;
      const claim = claimsNow[next];
      setPhase("ask");
      setAnswer(null);
      setChips([]);
      setText("");
      setMessages((prev) => [...prev, { id: `claim-${claim.id}`, role: "ai", text: claim.text }]);
      setTypingId(`claim-${claim.id}`);
      return;
    }

    if (id === "done") setDone(true);
  }

  function upsertRule(current: Session, rule: Rule) {
    return [...current.rules.filter((item) => item.key !== rule.key), rule];
  }

  async function accept(current: Claim, spoken = "Yes") {
    const live = sessionRef.current;
    const inferred = resultRef.current;
    if (!live || !inferred) return;
    setCanReply(false);
    setListening(false);
    const fromHistory = current.id.startsWith("history:");
    const previous = live.verified[current.id]?.confidence ?? 0.5;
    const instruction = normalizeInstruction(keptText(current, inferred));
    const rule: Rule = {
      text: instruction,
      source: fromHistory ? "history" : "learned",
      created_at: new Date().toISOString(),
      key: fromHistory ? current.id : `claim:${current.id}`,
      move: moveFromText(instruction),
    };
    tally.current.left += 1;
    await save({
      ...live,
      rules: upsertRule(live, rule),
      verified: { ...live.verified, [current.id]: { answer: "yes", confidence: Math.round((previous + 0.1) * 100) / 100, status: "verified" } },
      history: dropPending(live, current.id),
    });
    const ack = `ack-${current.id}`;
    setMessages((prev) => [
      ...prev,
      { id: `user-${current.id}`, role: "user", text: spoken },
      { id: ack, role: "ai", text: "I'll keep that." },
    ]);
    setTypingId(ack);
  }

  async function refine(current: Claim, spoken: string, chosen: "not_quite" | "depends", authored = false) {
    const live = sessionRef.current;
    if (!live || busy) return;
    setBusy(true);
    setCanReply(false);
    setListening(false);
    setMessages((prev) => [...prev, { id: `user-${current.id}-${Date.now()}`, role: "user", text: spoken }]);
    const res = await fetch("/api/refine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim: current.text, answer: chosen, chips, text: spoken }),
    });
    const data = (await res.json()) as { revised: string; narrowed_from: string };
    const instruction = normalizeInstruction(data.revised);
    tally.current.updated += 1;
    const rule: Rule = {
      text: instruction,
      raw: authored ? spoken : undefined,
      source: current.id.startsWith("history:") ? "history" : authored ? "spoken" : "corrected",
      created_at: new Date().toISOString(),
      key: current.id.startsWith("history:") ? current.id : `claim:${current.id}`,
      move: moveFromText(instruction),
    };
    await save({
      ...live,
      rules: upsertRule(live, rule),
      verified: {
        ...live.verified,
        [current.id]: { answer: chosen, correction: data.revised, narrowed_from: data.narrowed_from },
      },
      history: dropPending(live, current.id),
    });
    setMessages((prev) => [...prev, { id: `update-${current.id}`, role: "ai", text: "", update: { revised: instruction, narrowed_from: data.narrowed_from } }]);
    setPhase("updated");
    setTypingId(null);
    setBusy(false);
    setChips([]);
    setText("");
  }

  function askFollowUp(current: Claim, chosen: "not_quite" | "depends", spoken?: string) {
    setAnswer(chosen);
    setPhase("correct");
    setCanReply(false);
    const follow = chosen === "depends" ? "What does it depend on?" : "Where did I get that wrong?";
    const id = `follow-${current.id}`;
    setMessages((prev) => [
      ...prev,
      ...(spoken ? [{ id: `user-${current.id}-nudge`, role: "user" as const, text: spoken }] : []),
      { id, role: "ai" as const, text: follow },
    ]);
    setTypingId(id);
  }

  function advance(ackId: string, ack: string, spoken?: string) {
    setCanReply(false);
    setListening(false);
    setPhase("ask");
    setAnswer(null);
    setChips([]);
    setText("");
    setAmountInput("");
    setChipChoice(null);
    setMessages((prev) => [
      ...prev,
      ...(spoken ? [{ id: `user-${ackId}`, role: "user" as const, text: spoken }] : []),
      { id: ackId, role: "ai" as const, text: ack },
    ]);
    setTypingId(ackId);
  }

  async function submitAmount(current: Claim, value: number) {
    const live = sessionRef.current;
    if (!live || !Number.isFinite(value) || value <= 0) return;
    const rounded = Math.round(value);
    const rule: Rule = {
      text: normalizeInstruction(`Ask me before spending over ${money(rounded)}.`),
      source: "spoken",
      created_at: new Date().toISOString(),
      key: "claim:money",
      move: "ask",
    };
    tally.current.updated += 1;
    tally.current.amount = rounded;
    await save({
      ...live,
      rules: upsertRule(live, rule),
      verified: {
        ...live.verified,
        no_limit: {
          answer: "threshold",
          band: [Math.round(rounded * 0.7), rounded],
          confidence: 0.9,
          basis: { user_stated: true },
          status: "verified",
        },
      },
    });
    advance(`ack-${current.id}`, `Got it — I'll ask you about anything over ${money(rounded)}.`, money(rounded));
  }

  async function escapeLimit(current: Claim) {
    const live = sessionRef.current;
    if (!live) return;
    const rule: Rule = {
      text: "Go ahead regardless of the amount.",
      source: "spoken",
      created_at: new Date().toISOString(),
      key: "claim:money",
      move: "act",
    };
    tally.current.left += 1;
    await save({
      ...live,
      rules: upsertRule(live, rule),
      verified: {
        ...live.verified,
        no_limit: { answer: "escape", band: [null, null], item: "cost_not_a_boundary", status: "verified" },
        cost_not_a_boundary: { answer: "yes", status: "verified", item: "cost_not_a_boundary" },
      },
    });
    advance(`ack-${current.id}`, "I'll leave cost as something that doesn't need a check.", current.escape);
  }

  async function pickChip(current: Claim, chip: string) {
    const live = sessionRef.current;
    if (!live) return;
    if (chip === "Other") {
      setChipChoice("Other");
      return;
    }
    if (current.id === "noise" && chip === "One was a slip") {
      tally.current.updated += 1;
      await save({
        ...live,
        verified: { ...live.verified, noise: { answer: "chip", noiseDismissed: true, correction: chip, confidence: 0.6, status: "verified" } },
      });
      advance(`ack-${current.id}`, "I'll treat that as a slip.", chip);
      return;
    }
    if (current.id === "noise") {
      tally.current.left += 1;
      await save({
        ...live,
        verified: { ...live.verified, noise: { answer: "chip", open: true, correction: chip, status: "verified" } },
      });
      advance(`ack-${current.id}`, "I'll keep that as an open question.", chip);
      return;
    }
    const grant = autonomyRule(chip);
    const instruction = normalizeInstruction(grant.text);
    const rule: Rule = {
      text: instruction,
      raw: chip,
      source: "spoken",
      created_at: new Date().toISOString(),
      key: `claim:${current.id}`,
      move: moveFromText(instruction),
    };
    tally.current.updated += 1;
    await save({
      ...live,
      rules: upsertRule(live, rule),
      verified: { ...live.verified, [current.id]: { answer: "chip", correction: chip, confidence: 0.6, status: "verified" } },
      history: dropPending(live, current.id),
    });
    setCanReply(false);
    setMessages((prev) => [
      ...prev,
      { id: `user-${current.id}`, role: "user", text: chip },
      { id: `update-${current.id}`, role: "ai", text: "", update: { revised: instruction, narrowed_from: current.text } },
    ]);
    setPhase("updated");
    setTypingId(null);
    setChipChoice(null);
  }

  function onHeard(transcript: string) {
    const claim = listRef.current[indexRef.current];
    if (!claim || !canReply) return;
    if (phase === "correct" || chipChoice === "Other") {
      void refine(claim, transcript, answer ?? "not_quite", true);
      return;
    }
    if (claim.type === "threshold") {
      if (/wouldn'?t|no amount|don'?t need|do not need/i.test(transcript)) {
        void escapeLimit(claim);
        return;
      }
      const found = transcript.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
      if (found) {
        void submitAmount(claim, Number(found[1]));
        return;
      }
    }
    if (claim.type === "chips") {
      const match = claim.chips.find((chip) => transcript.toLowerCase().includes(chip.toLowerCase()));
      if (match) {
        void pickChip(claim, match);
        return;
      }
    }
    const kind = interpret(transcript);
    if (kind === "yes") {
      void accept(claim, transcript);
      return;
    }
    if (kind === "not_quite" || kind === "depends") {
      askFollowUp(claim, kind, transcript);
      return;
    }
    void refine(claim, transcript, "not_quite", true);
  }

  function sendDraft() {
    const value = text.trim();
    if (!value) return;
    setText("");
    setShowType(false);
    onHeard(value);
  }

  function startListen() {
    const rec = getRecognition();
    if (!rec) {
      setSpeechOk(false);
      setShowType(true);
      return;
    }
    window.speechSynthesis?.cancel();
    recognition.current = rec;
    listeningRef.current = true;
    setListening(true);
    setShowType(true);
    rec.onresult = (event) => {
      if (!listeningRef.current) return;
      let final = "";
      let interimText = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += piece;
        else interimText += piece;
      }
      setText(`${final} ${interimText}`.replace(/\s+/g, " ").trim());
    };
    rec.onerror = () => {
      listeningRef.current = false;
      setListening(false);
    };
    rec.onend = () => {
      listeningRef.current = false;
      setListening(false);
    };
    rec.start();
  }

  function continueAfterUpdate() {
    setPhase("ask");
    const claimsNow = listRef.current;
    const next = indexRef.current + 1;
    if (next >= claimsNow.length) {
      setMessages((prev) => [...prev, { id: "done", role: "ai", text: closingText(tally.current) }]);
      setTypingId("done");
      return;
    }
    indexRef.current = next;
    const claim = claimsNow[next];
    setPhase("ask");
    setAnswer(null);
    setMessages((prev) => [...prev, { id: `claim-${claim.id}`, role: "ai", text: claim.text }]);
    setTypingId(`claim-${claim.id}`);
  }

  if (!ready || !session) return <div className="min-h-[40vh]" />;

  const answered = Object.keys(session.answers).length;
  if ((!raw || answered < 6) && pending.length === 0) {
    return (
      <div className="mx-auto max-w-[720px] px-6 pb-24 text-center">
        <Mascot size={200} />
        <p className="mt-8 text-[20px]">Finish the test first, then I can check what I think I learned.</p>
        <Link href="/test" className="mt-6 inline-block text-accent">
          Start the test →
        </Link>
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="mx-auto flex max-w-[720px] flex-col items-center px-6 pb-24 text-center">
        <Mascot size={200} />
        <p className="mt-8 text-[20px] font-semibold">Thanks — that helps.</p>
        <p className="mt-3 text-[16px] text-muted">What we checked is already on your profile.</p>
        <Link href="/profile" className="mt-6 rounded-[12px] bg-ink px-5 py-3 text-[15px] font-medium text-white">
          See my profile →
        </Link>
      </div>
    );
  }

  const claim = list[indexRef.current];

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col px-6 pb-16">
      <div className="sticky top-0 z-10 bg-bg/90 py-4 backdrop-blur">
        <Mascot size={160} listening={listening} />
      </div>

      <div className="mt-2 flex flex-col gap-3" aria-live="polite">
        {messages.map((message) =>
          message.update ? (
            <div key={message.id} className="rise-in max-w-[90%] self-start rounded-[20px] border border-go bg-surface px-5 py-5">
              <p className="text-[13px] font-medium text-go">Updated</p>
              <p className="mt-3 text-[18px]">{message.update.revised}</p>
            </div>
          ) : (
            <div
              key={message.id}
              className={`max-w-[85%] whitespace-pre-line rounded-[20px] px-4 py-3 text-[17px] leading-snug ${
                message.role === "ai" ? "self-start border border-hairline bg-surface" : "self-end bg-accent-bg"
              }`}
            >
              {message.role === "ai" ? (
                <TypeLine text={message.text} active={typingId === message.id} onDone={() => finishTyping(message.id)} />
              ) : (
                message.text
              )}
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      {done ? (
        <Link href="/profile" className="mt-8 self-center rounded-[12px] bg-ink px-5 py-3 text-[15px] font-medium text-white">
          See my profile →
        </Link>
      ) : null}

      {phase === "updated" ? (
        <button
          type="button"
          onClick={continueAfterUpdate}
          className="mt-6 self-center rounded-[12px] bg-ink px-5 py-3 text-[15px] font-medium text-white"
        >
          {indexRef.current + 1 >= list.length ? "Continue" : "Next"}
        </button>
      ) : null}

      {canReply && claim ? (
        <div className="mt-8 flex flex-col items-center">
          <button
            type="button"
            onClick={() => (listening ? recognition.current?.stop() : startListen())}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-[24px] text-white"
            aria-label={listening ? "Stop listening" : "Tap to speak"}
          >
            🎤
          </button>
          <p className="mt-2 text-[14px] text-muted">{listening ? "Listening…" : "Tap to speak"}</p>
          {!speechOk ? <p className="mt-2 text-[14px] text-muted">Speech isn&apos;t available here. Type instead.</p> : null}

          {phase === "ask" && claim.type === "threshold" ? (
            <div className="mt-5 w-full max-w-sm">
              <label className="flex items-center gap-2 rounded-[12px] border border-hairline bg-surface px-4 py-3 text-[18px]">
                <span className="text-muted">$</span>
                <input
                  inputMode="numeric"
                  value={amountInput ? Number(amountInput).toLocaleString("en-US") : ""}
                  onChange={(event) => setAmountInput(event.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="2,000"
                  className="w-full bg-transparent outline-none"
                  aria-label="Amount"
                />
              </label>
              <button
                type="button"
                disabled={!amountInput || Number(amountInput) <= 0}
                onClick={() => void submitAmount(claim, Number(amountInput))}
                className="mt-3 rounded-[12px] bg-ink px-5 py-3 text-[15px] font-medium text-white disabled:opacity-40"
              >
                That&apos;s right →
              </button>
              {claim.escape ? (
                <button type="button" onClick={() => void escapeLimit(claim)} className="mt-4 block text-[15px] text-accent">
                  {claim.escape}
                </button>
              ) : null}
            </div>
          ) : null}

          {phase === "ask" && claim.type === "chips" ? (
            <div className="mt-5 w-full">
              <div className="flex flex-wrap justify-center gap-2">
                {[...claim.chips, "Other"].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => void pickChip(claim, chip)}
                    className={`rounded-[999px] border px-4 py-2 text-[14px] ${chipChoice === chip ? "border-accent bg-accent-bg" : "border-hairline bg-surface"}`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
              {chipChoice === "Other" ? (
                <form
                  className="mt-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (text.trim()) void refine(claim, text.trim(), "not_quite", true);
                  }}
                >
                  <textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Say it in your own words"
                    className="min-h-24 w-full rounded-[12px] border border-hairline bg-surface px-4 py-3 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={busy || !text.trim()}
                    className="mt-3 rounded-[12px] bg-ink px-5 py-3 text-[15px] font-medium text-white disabled:opacity-40"
                  >
                    {busy ? "Updating…" : "Update my profile"}
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}

          {phase === "ask" && (claim.type === "yesno" || !claim.type) ? (
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button type="button" onClick={() => void accept(claim)} className="rounded-[12px] bg-ink px-5 py-3 text-white">
                Yes
              </button>
              <button type="button" onClick={() => askFollowUp(claim, "not_quite")} className="rounded-[12px] border border-hairline bg-surface px-5 py-3">
                Not quite
              </button>
              <button type="button" onClick={() => askFollowUp(claim, "depends")} className="rounded-[12px] border border-hairline bg-surface px-5 py-3">
                Depends
              </button>
            </div>
          ) : phase === "correct" ? (
            <div className="mt-5 w-full">
              <div className="flex flex-wrap gap-2">
                {claim.chips.map((chip) => {
                  const on = chips.includes(chip);
                  return (
                    <button
                      key={chip}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setChips((current) => (on ? current.filter((item) => item !== chip) : [...current, chip]))}
                      className={`rounded-full border px-3 py-1.5 text-[14px] ${on ? "border-accent bg-accent-bg" : "border-hairline bg-surface text-muted"}`}
                    >
                      {chip}
                    </button>
                  );
                })}
              </div>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Fix anything that came out wrong, or say it in your own words"
                className="mt-4 min-h-24 w-full rounded-[12px] border border-hairline bg-surface px-4 py-3 outline-none"
              />
              <button
                type="button"
                disabled={busy || (chips.length === 0 && !text.trim())}
                onClick={() => void refine(claim, [text.trim(), ...chips].filter(Boolean).join(". "), answer ?? "not_quite", Boolean(text.trim()))}
                className="mt-4 rounded-[12px] bg-ink px-5 py-3 text-[15px] font-medium text-white disabled:opacity-40"
              >
                {busy ? "Updating…" : "Update my profile"}
              </button>
            </div>
          ) : null}

          {phase === "ask" && claim.type !== "threshold" && claim.type !== "chips" && !showType && !listening ? (
            <button type="button" className="mt-4 text-[15px] text-accent" onClick={() => setShowType(true)}>
              or type instead →
            </button>
          ) : null}
          {phase === "ask" && (showType || listening) ? (
            <form
              className="mt-4 w-full"
              onSubmit={(event) => {
                event.preventDefault();
                sendDraft();
              }}
            >
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Fix anything that came out wrong"
                className="min-h-24 w-full rounded-[12px] border border-hairline bg-surface px-4 py-3 outline-none"
              />
              <button
                type="submit"
                disabled={!text.trim()}
                className="mt-3 rounded-[12px] bg-ink px-5 py-3 text-[15px] font-medium text-white disabled:opacity-40"
              >
                Send
              </button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
