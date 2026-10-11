"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Mascot } from "@/components/Mascot";
import { CHIPS, CHOICES, domainLabel, scenarioQueue } from "@/lib/scenarios";
import { useSession } from "@/lib/session-client";
import type { Reasons } from "@/lib/types";

export default function TestPage() {
  const router = useRouter();
  const { session, ready, save } = useSession();
  const [index, setIndex] = useState(0);
  const [placed, setPlaced] = useState(false);
  const [phase, setPhase] = useState<"choice" | "why">("choice");
  const [pending, setPending] = useState<number | null>(null);
  const [chips, setChips] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [confirmExit, setConfirmExit] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const queue = useMemo(() => scenarioQueue(session?.answers ?? {}), [session?.answers]);
  const scenario = queue[index];

  useEffect(() => {
    if (!ready || !session || placed) return;
    const nextQueue = scenarioQueue(session.answers);
    const firstOpen = nextQueue.findIndex((item) => session.answers[item.id] == null);
    setIndex(firstOpen === -1 ? 0 : firstOpen);
    setPlaced(true);
  }, [ready, session, placed]);

  useEffect(() => {
    if (!scenario || !session) return;
    setPending(session.answers[scenario.id] ?? null);
    const stored = session.reasons[scenario.id];
    setChips(Array.isArray(stored) ? stored : []);
    setNote(session.reasons._text?.[scenario.id] ?? "");
    setPhase("choice");
    // Reload the saved answer when the question changes, or when the session first arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario?.id, ready]);

  useEffect(() => {
    if (!finishing) return;
    const timer = window.setTimeout(() => router.push("/"), 1800);
    return () => window.clearTimeout(timer);
  }, [finishing, router]);

  if (finishing) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-6 text-center">
        <Mascot size={220} />
        <p className="mt-8 text-[22px] font-semibold">Learning and updating your profile.</p>
      </div>
    );
  }

  if (!ready || !session || !scenario) {
    return <div className="min-h-screen bg-bg" />;
  }

  function choose(value: number) {
    setPending(value);
    window.setTimeout(() => setPhase("why"), 200);
  }

  async function commit(value: number) {
    const answers = { ...session!.answers, [scenario.id]: value };
    if (scenario.id === "cost_3" && value < 4) delete answers.cost_3b;

    const reasons: Reasons = { ...session!.reasons, _text: { ...session!.reasons._text } };
    if (chips.length) reasons[scenario.id] = chips;
    else delete reasons[scenario.id];
    if (note.trim()) reasons._text![scenario.id] = note.trim();
    else delete reasons._text![scenario.id];
    if (reasons._text && Object.keys(reasons._text).length === 0) delete reasons._text;

    const next = { ...session!, answers, reasons };
    await save(next);

    const upcoming = scenarioQueue(answers);
    const nextIndex = index + 1;
    if (nextIndex >= upcoming.length) {
      sessionStorage.setItem("ai-profile-filled", "1");
      setFinishing(true);
      return;
    }
    setIndex(nextIndex);
  }

  return (
    <div className="min-h-screen bg-bg px-6 py-6">
      <div className="mx-auto flex max-w-[720px] items-center justify-between">
        <div className="flex gap-2" aria-label="Progress">
          {queue.map((item, dot) => (
            <span
              key={item.id}
              className={`h-2 w-2 rounded-full ${dot <= index && (dot < index || phase === "why" || pending != null) ? "bg-ink" : "border border-ink/30 bg-transparent"}`}
            />
          ))}
        </div>
        {confirmExit ? (
          <div className="flex items-center gap-3 text-[14px]">
            <span className="text-muted">Leave the test?</span>
            <button type="button" className="font-medium" onClick={() => router.push("/")}>
              Exit
            </button>
            <button type="button" className="text-muted" onClick={() => setConfirmExit(false)}>
              Stay
            </button>
          </div>
        ) : (
          <button type="button" className="text-[20px] leading-none text-muted" onClick={() => setConfirmExit(true)} aria-label="Exit">
            ✕
          </button>
        )}
      </div>

      <div className="mx-auto mt-16 flex max-w-[520px] flex-col items-center">
        {index > 0 ? (
          <button
            type="button"
            className="mb-8 self-start text-[14px] text-muted"
            onClick={() => {
              if (phase === "why") {
                setPhase("choice");
                return;
              }
              setIndex((current) => Math.max(0, current - 1));
            }}
          >
            ← Back
          </button>
        ) : (
          <div className="mb-8 h-5" />
        )}

        <p className="text-[15px] text-muted">
          <span className="mr-2">{scenario.icon}</span>
          {domainLabel(scenario)}
        </p>
        <p className="mt-6 text-center text-[24px] leading-[1.5]">{scenario.text}</p>

        {phase === "choice" ? (
          <div className="mt-10 w-full">
            <p className="mb-4 text-center text-[16px]">What should it do?</p>
            <div className="overflow-hidden rounded-[20px] border border-hairline bg-surface">
              {CHOICES.map((choice) => {
                const selected = pending === choice.v;
                return (
                  <button
                    key={choice.v}
                    type="button"
                    onClick={() => choose(choice.v)}
                    className={`flex h-[72px] w-full flex-col justify-center border-b border-hairline px-5 text-left last:border-b-0 ${
                      selected ? "bg-accent-bg" : "hover:bg-accent-bg"
                    }`}
                  >
                    <span className="text-[17px] font-semibold">{choice.label}</span>
                    <span className="text-[14px] text-muted">{choice.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-10 w-full">
            <div className="flex items-baseline justify-between">
              <p className="text-[16px]">What mattered most here?</p>
              <button type="button" className="text-[14px] text-muted" onClick={() => pending != null && void commit(pending)}>
                skip →
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {CHIPS.map((chip) => {
                const on = chips.includes(chip);
                return (
                  <button
                    key={chip}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setChips((current) => (on ? current.filter((item) => item !== chip) : [...current, chip]))}
                    className={`rounded-full border px-3 py-1.5 text-[14px] ${
                      on ? "border-accent bg-accent-bg text-ink" : "border-hairline bg-surface text-muted"
                    }`}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="anything else?"
              className="mt-4 w-full rounded-[12px] border border-hairline bg-surface px-4 py-3 text-[16px] outline-none"
            />
            <button
              type="button"
              disabled={pending == null}
              onClick={() => pending != null && void commit(pending)}
              className="mt-6 rounded-[12px] bg-ink px-5 py-3 text-[15px] font-medium text-white disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
