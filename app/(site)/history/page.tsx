"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { HistoryCards } from "@/components/history-cards";
import { Mascot } from "@/components/Mascot";
import { decideFinding, readConversation, rememberFindings } from "@/lib/history";
import { resolveInference } from "@/lib/infer";
import { policyItems } from "@/lib/policy";
import { useSession } from "@/lib/session-client";
import type { HistoryFinding } from "@/lib/types";
import type { PolicyItem } from "@/lib/policy";

type Phase = "idle" | "reading" | "results" | "empty" | "error";

export default function HistoryPage() {
  const { session, ready, save } = useSession();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [paste, setPaste] = useState("");
  const [file, setFile] = useState<{ name: string; messages: number; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [checked, setChecked] = useState(0);
  const [slow, setSlow] = useState(false);
  const [messageCount, setMessageCount] = useState(0);

  useEffect(() => {
    function onWindowPaste(event: ClipboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const text = event.clipboardData?.getData("text") ?? "";
      if (!text.trim()) return;
      setFile(null);
      setPaste(text);
      setPhase((current) => (current === "reading" ? current : "idle"));
    }
    window.addEventListener("paste", onWindowPaste);
    return () => window.removeEventListener("paste", onWindowPaste);
  }, []);

  if (!ready || !session) return <div className="min-h-[40vh]" />;

  const result = resolveInference(session.answers, session.verified);
  const items = result ? policyItems(result, session.answers, session.rules) : [];
  const proposals = session.history?.proposals ?? [];
  const hasContent = Boolean(file?.text || paste.trim());
  const showIntake = phase === "idle" || phase === "error";

  function takeFile(next: File) {
    void next.text().then((raw) => {
      const read = readConversation(raw);
      if (!read.text) return;
      setFile({ name: next.name, messages: read.messages, text: read.text });
      setPaste("");
      setPhase("idle");
    });
  }

  function clearIntake() {
    setFile(null);
    setPaste("");
    setPhase("idle");
    if (editorRef.current) editorRef.current.innerText = "";
  }

  async function learn() {
    const source = file?.text || paste;
    const read = readConversation(source);
    if (!read.text) return;
    setPhase("reading");
    setSlow(false);
    setChecked(1);
    setMessageCount(read.messages);
    const started = Date.now();
    const second = window.setTimeout(() => setChecked(2), 600);
    const background = window.setTimeout(() => setSlow(true), 20000);
    try {
      const res = await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: read.text }),
      });
      if (!res.ok) throw new Error("read failed");
      const data = (await res.json()) as { findings?: HistoryFinding[] };
      const elapsed = Date.now() - started;
      if (elapsed < 1200) await new Promise((resolve) => window.setTimeout(resolve, 1200 - elapsed));
      const findings = data.findings ?? [];
      if (findings.length === 0) {
        setPhase("empty");
        return;
      }
      await save(rememberFindings(session!, findings));
      setPaste("");
      setFile(null);
      setPhase("results");
    } catch {
      setPhase("error");
    } finally {
      window.clearTimeout(second);
      window.clearTimeout(background);
    }
  }

  async function onDecide(finding: HistoryFinding, decision: "add" | "ignore" | "ask" | "keep" | "update", conflict?: PolicyItem | null) {
    const next = decideFinding(session!, finding, decision, conflict);
    await save(next);
    if ((next.history?.proposals.length ?? 0) === 0) setPhase("idle");
    if (decision === "ask") router.push("/interview");
  }

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col px-6 pb-24">
      <h1 className="mt-6 text-[28px] font-semibold tracking-tight">Learn from how you already use AI</h1>
      <p className="mt-3 text-[16px] text-muted">Your history shows what happened. Your AI Profile learns what should happen next.</p>

      {phase === "reading" ? (
        <div className="mt-8 flex flex-col items-start">
          <Mascot size={160} />
          <p className="mt-4 text-[18px] font-medium">
            {slow ? "I'm reading through this. It'll take a minute — carry on and I'll flag it when I'm done." : "Give me a second — I'm reading…"}
          </p>
          {slow ? null : (
            <ul className="mt-4 flex flex-col gap-2 text-[15px]">
              <li>{`✓ Read ${messageCount} ${messageCount === 1 ? "message" : "messages"}`}</li>
              <li>{checked >= 2 ? "✓" : "◌"} Looking for moments you corrected or approved</li>
              <li>◌ Working out what they mean</li>
            </ul>
          )}
        </div>
      ) : null}

      {showIntake ? (
        <>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              const dropped = event.dataTransfer.files?.[0];
              if (dropped) takeFile(dropped);
              const text = event.dataTransfer.getData("text");
              if (!dropped && text.trim()) {
                setFile(null);
                setPaste(text);
              }
            }}
            onClick={(event) => {
              const target = event.target as HTMLElement;
              if (target.closest("[role=textbox]") || target.closest("button")) return;
              if (!file && !paste.trim()) fileInput.current?.click();
            }}
            className={`relative mt-6 flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-[20px] border border-dashed px-6 py-8 text-center ${dragOver ? "border-accent bg-surface" : "border-hairline bg-surface"}`}
          >
            <input
              ref={fileInput}
              type="file"
              accept=".json,.txt,.md,application/json,text/plain"
              className="hidden"
              onChange={(event) => {
                const next = event.target.files?.[0];
                if (next) takeFile(next);
                event.target.value = "";
              }}
            />
            {file ? (
              <p className="flex items-center gap-3 text-[16px]">
                <span>📄 {file.name} · {file.messages} message{file.messages === 1 ? "" : "s"}</span>
                <button type="button" aria-label="Clear file" onClick={clearIntake} className="text-[18px] text-muted">
                  ✕
                </button>
              </p>
            ) : (
              <>
                {!paste.trim() ? <p className="pointer-events-none text-[16px]">Paste a conversation, or drop a file here</p> : null}
                <div
                  ref={editorRef}
                  role="textbox"
                  aria-label="Paste a conversation, or drop a file here"
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(event) => setPaste(event.currentTarget.innerText)}
                  onPaste={(event) => {
                    const text = event.clipboardData.getData("text");
                    if (!text.trim()) return;
                    event.preventDefault();
                    setPaste(text);
                    event.currentTarget.innerText = text;
                  }}
                  className={`z-0 max-h-40 w-full overflow-auto whitespace-pre-wrap text-left text-[16px] outline-none ${paste.trim() ? "" : "absolute inset-0"}`}
                />
                <button type="button" onClick={() => fileInput.current?.click()} className="relative z-10 mt-3 text-[14px] text-muted">
                  ChatGPT · Claude · .txt
                </button>
                {paste.trim() ? (
                  <button type="button" onClick={clearIntake} className="mt-2 text-[14px] text-muted">
                    ✕ Clear
                  </button>
                ) : null}
              </>
            )}
          </div>
          <button
            type="button"
            disabled={!hasContent}
            onClick={() => void learn()}
            className="mt-4 self-start rounded-[12px] bg-ink px-5 py-3 text-[15px] font-medium text-white disabled:opacity-40"
          >
            {phase === "error" ? "Try again" : "Learn and update my profile →"}
          </button>
          <p className="mt-4 text-[14px] text-muted">
            {phase === "error"
              ? "Something went wrong reading that. Your conversation wasn't saved. Read once, never stored. Only patterns you approve are kept."
              : "Read once, never stored. Only patterns you approve are kept."}
          </p>
        </>
      ) : null}

      {phase === "empty" ? (
        <div className="mt-8 rounded-[20px] border border-hairline bg-surface px-5 py-5">
          <p className="text-[18px] font-semibold">Nothing I could learn from, this time</p>
          <p className="mt-3 text-[16px] text-muted">
            This looks like a question-and-answer conversation. I learn most from sessions where you corrected me, told me to go ahead, or stopped me doing something.
          </p>
          <p className="mt-3 text-[16px]">Try a conversation where you were working rather than asking.</p>
          <div className="mt-5 flex flex-wrap items-center gap-4">
            <button type="button" onClick={clearIntake} className="rounded-[12px] bg-ink px-4 py-2 text-[14px] text-white">
              Try another
            </button>
            <Link href="/test" className="text-[14px] text-accent">
              Take the test instead →
            </Link>
          </div>
        </div>
      ) : null}

      {proposals.length > 0 && phase !== "reading" ? (
        <>
          <div className="mt-8 rounded-[20px] border border-hairline bg-surface px-5 py-5">
            <p className="text-[18px] font-semibold">
              I found {proposals.length} pattern{proposals.length === 1 ? "" : "s"}
            </p>
            <p className="mt-2 text-[16px] text-muted">Tell me which ones are right.</p>
          </div>
          <HistoryCards proposals={proposals} items={items} onDecide={(finding, decision, conflict) => void onDecide(finding, decision, conflict)} />
          {phase === "results" ? (
            <button type="button" onClick={clearIntake} className="mt-4 self-start text-[14px] text-accent">
              Add another conversation
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
