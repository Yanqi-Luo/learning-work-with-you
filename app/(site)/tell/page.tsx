"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/Mascot";
import { moveFromText, normalizeInstruction } from "@/lib/instruction";
import { useSession } from "@/lib/session-client";
import type { Rule } from "@/lib/types";

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

export default function TellPage() {
  const { session, ready, save } = useSession();
  const [phase, setPhase] = useState<"idle" | "listening" | "review" | "saved">("idle");
  const [interim, setInterim] = useState("");
  const [drafts, setDrafts] = useState<string[]>([]);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const [speechOk, setSpeechOk] = useState(true);
  const [busy, setBusy] = useState(false);
  const recognition = useRef<BrowserSpeech | null>(null);
  const finalText = useRef("");
  const heardRef = useRef("");

  useEffect(() => {
    setSpeechOk(Boolean(getRecognition()));
  }, []);

  async function review(text: string) {
    const clean = text.trim();
    if (!clean) {
      setPhase("idle");
      return;
    }
    setBusy(true);
    setPhase("review");
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: clean }),
    });
    const data = (await res.json()) as { rules: { text: string }[] };
    const rules = data.rules?.map((rule) => rule.text).filter(Boolean);
    setDrafts(rules?.length ? rules : [clean]);
    setBusy(false);
  }

  function start() {
    const rec = getRecognition();
    if (!rec) {
      setSpeechOk(false);
      setTyping(true);
      return;
    }
    recognition.current = rec;
    finalText.current = "";
    heardRef.current = "";
    setInterim("");
    setPhase("listening");
    rec.onresult = (event) => {
      let final = "";
      let interimText = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += piece;
        else interimText += piece;
      }
      const heard = `${final} ${interimText}`.replace(/\s+/g, " ").trim();
      finalText.current = final;
      heardRef.current = heard;
      setInterim(heard);
    };
    rec.onerror = () => setPhase("idle");
    rec.onend = () => {
      const heard = heardRef.current.trim();
      setInterim("");
      if (heard) void review(heard);
      else setPhase("idle");
    };
    rec.start();
  }

  function stop() {
    recognition.current?.stop();
  }

  async function add() {
    if (!session) return;
    const now = new Date().toISOString();
    const seen = new Set(session.rules.map((rule) => normalizeInstruction(rule.text).replace(/[.]+$/, "").toLowerCase()));
    const spoken: Rule[] = drafts
      .map((text) => text.trim())
      .filter(Boolean)
      .flatMap((text) => {
        const instruction = normalizeInstruction(text);
        const key = instruction.replace(/[.]+$/, "").toLowerCase();
        if (!key || seen.has(key)) return [];
        seen.add(key);
        return [
          {
            raw: text.trim(),
            text: instruction,
            source: "spoken" as const,
            created_at: now,
            key: `spoken:${now}:${seen.size}`,
            move: moveFromText(instruction),
          },
        ];
      });
    await save({ ...session, rules: [...session.rules, ...spoken] });
    setPhase("saved");
  }

  if (!ready || !session) return <div className="min-h-[40vh]" />;

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col items-center px-6 pb-24">
      <Mascot size={260} listening={phase === "listening"} />
      <h1 className="mt-8 text-center text-[28px] font-semibold tracking-tight">
        Tell me how you want AI to work with you.
      </h1>

      {phase === "idle" || phase === "listening" ? (
        <div className="mt-10 flex flex-col items-center">
          <button
            type="button"
            onClick={() => (phase === "listening" ? stop() : start())}
            className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-accent text-[28px] text-white"
            aria-label={phase === "listening" ? "Stop listening" : "Tap to speak"}
          >
            🎤
          </button>
          <p className="mt-3 text-[14px] text-muted">{phase === "listening" ? "Listening…" : "tap to speak"}</p>
          {interim ? <p className="mt-4 max-w-md text-center text-[16px] text-muted">{interim}</p> : null}
          {!speechOk ? <p className="mt-4 text-[14px] text-muted">Speech isn&apos;t available here. Type instead.</p> : null}
          <button type="button" className="mt-8 text-[15px] text-accent" onClick={() => setTyping((value) => !value)}>
            or type instead →
          </button>
          {typing ? (
            <form
              className="mt-4 w-full max-w-md"
              onSubmit={(event) => {
                event.preventDefault();
                void review(typed);
              }}
            >
              <textarea
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder="Never send professional emails without showing me first."
                className="min-h-28 w-full rounded-[12px] border border-hairline bg-surface px-4 py-3 outline-none"
              />
              <button type="submit" className="mt-3 rounded-[12px] bg-ink px-5 py-3 text-[15px] font-medium text-white">
                Review
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {phase === "review" ? (
        <div className="mt-10 w-full max-w-md">
          <p className="text-[13px] text-muted">Here&apos;s what I heard. Fix anything that came out wrong.</p>
          <div className="mt-2 overflow-hidden rounded-[20px] border border-hairline bg-surface">
            {busy && drafts.length === 0 ? <p className="px-4 py-4 text-muted">Reading that…</p> : null}
            {drafts.map((draft, index) => (
              <label key={index} className="block border-b border-hairline px-4 py-3 last:border-b-0">
                <span className="mr-2 text-muted">✎</span>
                <input
                  value={draft}
                  onChange={(event) =>
                    setDrafts((current) => current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))
                  }
                  className="w-[calc(100%-1.5rem)] bg-transparent outline-none"
                />
              </label>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button
              type="button"
              disabled={busy || drafts.every((draft) => !draft.trim())}
              onClick={() => void add()}
              className="rounded-[12px] bg-ink px-5 py-3 text-[15px] font-medium text-white disabled:opacity-40"
            >
              Add to my profile
            </button>
            <button
              type="button"
              className="text-[15px] text-muted"
              onClick={() => {
                setPhase("idle");
                setTyped("");
                setInterim("");
              }}
            >
              Record again
            </button>
            <button
              type="button"
              className="text-[15px] text-muted"
              onClick={() => {
                setPhase("idle");
                setDrafts([]);
                setTyped("");
              }}
            >
              Discard
            </button>
          </div>
        </div>
      ) : null}

      {phase === "saved" ? (
        <div className="mt-10 text-center">
          <p className="text-[20px] font-semibold">Added to your profile.</p>
          <div className="mt-6 flex justify-center gap-4">
            <Link href="/profile" className="rounded-[12px] bg-ink px-5 py-3 text-[15px] font-medium text-white">
              View profile
            </Link>
            <button
              type="button"
              className="text-[15px] text-accent"
              onClick={() => {
                setPhase("idle");
                setDrafts([]);
                setTyped("");
              }}
            >
              Tell me something else
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
