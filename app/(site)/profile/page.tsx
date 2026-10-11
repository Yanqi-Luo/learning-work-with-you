"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { HistoryCards } from "@/components/history-cards";
import { TypeCard } from "@/components/type-card";
import { archetype } from "@/lib/archetype";
import { buildExport, type ExportFormat } from "@/lib/export-profile";
import { conflictsWith, decideFinding } from "@/lib/history";
import { activeFindings, resolveInference } from "@/lib/infer";
import { GROUP_LABELS, GROUP_ORDER, policyItems, type PolicyGroup } from "@/lib/policy";
import { useSession } from "@/lib/session-client";
import { answersKey, emptyHistory, parseNarration, type Finding, type HistoryFinding } from "@/lib/types";
import { narrateInput, templateNarration } from "@/lib/templates";
import type { PolicyItem } from "@/lib/policy";

function visibleFindings(findings: Finding[], summary: string) {
  const haystack = summary.toLowerCase();
  return findings.filter((finding) => !haystack.includes(finding.h.toLowerCase().replace(/\.$/, "")));
}

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

export default function ProfilePage() {
  const { session, ready, save } = useSession();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [summary, setSummary] = useState("");
  const [copied, setCopied] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("short");
  const [exportBody, setExportBody] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [snapshotKey, setSnapshotKey] = useState<string | null>(null);
  const [snapshotCount, setSnapshotCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const result = session ? resolveInference(session.answers, session.verified) : null;
  const keys = result ? activeFindings(result) : [];
  const key = session && result ? `${answersKey(session.answers)}|${result.band.join(",")}|${result.noise}` : "";
  const type = result && session ? archetype(result, session.answers) : null;
  const items = result && session ? policyItems(result, session.answers, session.rules) : [];
  const unchecked = new Set(session?.unchecked ?? []);
  const selected = items.filter((item) => !unchecked.has(item.id));
  const proposals = session?.history?.proposals ?? [];
  const conflicts = proposals.filter((finding) => conflictsWith(finding, items));

  useEffect(() => {
    setFresh(sessionStorage.getItem("ai-profile-filled") === "1");
    sessionStorage.removeItem("ai-profile-filled");
  }, []);

  useEffect(() => {
    if (!session || !result) {
      setFindings([]);
      setSummary("");
      return;
    }
    const cached = parseNarration(session.summary, key);
    const stale = cached
      ? /\b(steps?|drops?|scores?)\b/i.test(`${cached.summary} ${cached.findings.map((item) => `${item.h} ${item.b}`).join(" ")}`)
      : false;
    const local = cached && !stale ? cached : templateNarration(narrateInput(result, keys, key));
    setSummary(local.summary);
    setFindings(local.findings);
    if (cached && !stale) return;

    let cancelled = false;
    (async () => {
      const res = await fetch("/api/narrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(narrateInput(result, keys, key)),
      });
      if (!res.ok || cancelled) return;
      const narration = await res.json();
      if (cancelled) return;
      setSummary(narration.summary);
      setFindings(narration.findings);
      await save({ ...session, summary: JSON.stringify({ ...narration, answersKey: key }) });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);

  const selectionKey = selected.map((item) => item.id).join("|");
  const selectionStale = exportBody != null && snapshotKey !== selectionKey;

  function openExport(nextFormat: ExportFormat, nextItems: PolicyItem[]) {
    const text = buildExport(nextItems, nextFormat);
    setExportBody(text);
    setDraft(text);
    setEditing(false);
    setSnapshotKey(nextItems.map((item) => item.id).join("|"));
    setSnapshotCount(nextItems.length);
    setCopied(false);
    window.setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }

  function changeFormat(next: ExportFormat) {
    setFormat(next);
    if (exportBody == null || snapshotKey !== selectionKey) return;
    const text = buildExport(selected, next);
    setExportBody(text);
    setDraft(text);
    setEditing(false);
  }

  async function copyExport() {
    const text = (editing ? draft : exportBody) ?? "";
    if (!text) return;
    const ok = await writeClipboard(text);
    if (!ok) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  function setUnchecked(next: string[]) {
    if (!session) return;
    void save({ ...session, unchecked: next });
  }

  function toggle(id: string) {
    const next = new Set(unchecked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setUnchecked([...next]);
  }

  function toggleGroup(group: PolicyGroup) {
    const ids = items.filter((item) => item.group === group).map((item) => item.id);
    const allOn = ids.every((id) => !unchecked.has(id));
    const next = new Set(unchecked);
    for (const id of ids) {
      if (allOn) next.add(id);
      else next.delete(id);
    }
    setUnchecked([...next]);
  }

  async function onDecide(finding: HistoryFinding, decision: "add" | "ignore" | "ask" | "keep" | "update", conflict?: PolicyItem | null) {
    if (!session) return;
    const next = decideFinding({ ...session, history: session.history ?? emptyHistory() }, finding, decision, conflict);
    await save(next);
    if (decision === "ask") window.location.href = "/interview";
  }

  if (!ready || !session) return <div className="min-h-[50vh]" />;

  const noticed = visibleFindings(findings, summary);
  const mascotLine =
    Object.keys(session.verified).length > 0
      ? "Your profile's ready."
      : keys.length > 0
        ? "I'm starting to see how you decide."
        : "Hi — teach me how you'd like AI to work with you.";
  const grouped = GROUP_ORDER.map((group) => ({ group, items: items.filter((item) => item.group === group) })).filter((entry) => entry.items.length > 0);

  return (
    <div className="mx-auto w-full max-w-[920px] px-6 pb-28">
      <div className="mx-auto flex max-w-[720px] flex-col items-center pt-8 text-center">
        <h1 className="text-[28px] font-semibold tracking-tight">Your AI Profile</h1>
        <p className="mt-1 text-[13px] text-muted">{mascotLine}</p>
        {summary ? <p className="mt-6 text-[16px] leading-relaxed">{summary}</p> : null}
      </div>

      {type ? <TypeCard archetype={type} /> : null}

      <section className="mt-10">
        <h2 className="text-[13px] font-medium tracking-wide text-muted">WHAT I NOTICED</h2>
        {noticed.length > 0 ? (
          <div className={`mt-3 overflow-hidden rounded-[20px] bg-warm ${fresh ? "rise-in" : ""}`}>
            {noticed.map((finding) => (
              <div key={finding.h} className="border-b border-ink/5 px-5 py-5 last:border-b-0">
                <p className="text-[20px] font-semibold">{finding.h}</p>
                <p className="mt-1 text-[16px] text-muted">{finding.b}</p>
              </div>
            ))}
          </div>
        ) : findings.length === 0 ? (
          <div className="mt-3 rounded-[20px] border border-hairline bg-warm px-5 py-6">
            <p className="text-[20px] font-semibold">Nothing yet</p>
            <p className="mt-2 text-[16px] text-muted">Answer a few scenarios and I&apos;ll start noticing.</p>
            <Link href="/test" className="mt-4 inline-block text-[15px] font-medium text-accent">
              Start the test →
            </Link>
          </div>
        ) : null}
      </section>

      {conflicts.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-[13px] font-medium tracking-wide text-muted">NEEDS YOUR CALL</h2>
          <HistoryCards proposals={conflicts} items={items} onDecide={(finding, decision, conflict) => void onDecide(finding, decision, conflict)} />
        </section>
      ) : null}

      <section className="mt-10">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-[13px] font-medium tracking-wide text-muted">YOUR POLICIES</h2>
          <div className="flex gap-3 text-[13px]">
            <button type="button" className="text-accent" onClick={() => setUnchecked([])}>
              Select all
            </button>
            <button type="button" className="text-muted" onClick={() => setUnchecked(items.map((item) => item.id))}>
              Clear
            </button>
          </div>
        </div>
        {items.length === 0 ? (
          <div className="mt-3 rounded-[20px] border border-hairline bg-surface px-5 py-6">
            <p className="text-[16px] text-muted">Nothing to turn into a policy yet.</p>
            <Link href="/test" className="mt-3 inline-block text-[15px] font-medium text-accent">
              Start the test →
            </Link>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-6">
            {grouped.map((entry) => (
              <div key={entry.group}>
                <button type="button" onClick={() => toggleGroup(entry.group)} className="text-[13px] font-medium tracking-wide text-muted">
                  {GROUP_LABELS[entry.group]}
                </button>
                <div className="mt-2 overflow-hidden rounded-[20px] border border-hairline bg-surface">
                  {entry.items.map((item) => {
                    const on = !unchecked.has(item.id);
                    return (
                      <label key={item.id} className="flex items-start gap-3 border-b border-hairline px-5 py-4 last:border-b-0">
                        <input type="checkbox" className="mt-1 h-4 w-4 accent-accent" checked={on} onChange={() => toggle(item.id)} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[16px]">{item.text}</span>
                          <span className="mt-1 block text-[12px] text-muted">{item.source}</span>
                          {item.raw ? <span className="mt-1 block text-[13px] text-muted">You said: “{item.raw}”</span> : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="sticky bottom-0 z-10 mt-10 flex flex-wrap items-center justify-between gap-4 bg-bg/90 py-4 backdrop-blur">
        <p className="text-[13px] text-muted">
          {selected.length === 0
            ? "Pick at least one policy to include."
            : `${selected.length} of ${items.length} selected. Only the policies you selected are included. Nothing about how this was learned is shared.`}
        </p>
        <div className="flex items-center gap-3">
          <select
            value={format}
            onChange={(event) => changeFormat(event.target.value as ExportFormat)}
            className="rounded-[12px] border border-hairline bg-surface px-3 py-3 text-[14px]"
            aria-label="Export format"
          >
            <option value="short">Short</option>
            <option value="detailed">Detailed</option>
            <option value="structured">Structured</option>
          </select>
          <button
            type="button"
            onClick={() => openExport(format, selected)}
            disabled={selected.length === 0}
            className="rounded-[12px] bg-ink px-5 py-3 text-[15px] font-medium text-white disabled:opacity-40"
          >
            Generate →
          </button>
        </div>
      </div>

      {exportBody != null ? (
        <div ref={panelRef} className="rise-in mt-4 rounded-[16px] border border-hairline bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[16px] font-medium">Your profile</p>
            <div className="flex items-center gap-2">
              <select
                value={format}
                onChange={(event) => changeFormat(event.target.value as ExportFormat)}
                className="rounded-[12px] border border-hairline bg-bg px-3 py-2 text-[14px]"
                aria-label="Export format"
              >
                <option value="short">Short</option>
                <option value="detailed">Detailed</option>
                <option value="structured">Structured</option>
              </select>
              <button type="button" onClick={() => void copyExport()} className="rounded-[12px] border border-hairline bg-bg px-4 py-2 text-[14px]">
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>
          </div>
          {selectionStale ? (
            <p className="mt-4 text-[14px]">
              Selection changed —{" "}
              <button type="button" className="text-accent" onClick={() => openExport(format, selected)}>
                Regenerate
              </button>
            </p>
          ) : null}
          {editing ? (
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              className="mt-4 max-h-[420px] min-h-40 w-full resize-y bg-transparent text-[14px] leading-[1.7] outline-none"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            />
          ) : (
            <pre
              className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap text-[14px] leading-[1.7]"
              style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
            >
              {selectionStale ? exportBody : draft}
            </pre>
          )}
          <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
            <button type="button" className="text-[14px] text-accent" onClick={() => setEditing((value) => !value)}>
              {editing ? "Done editing" : "Edit before copying"}
            </button>
            <p className="max-w-sm text-right text-[13px] text-muted">
              Only the {snapshotCount} you selected {snapshotCount === 1 ? "is" : "are"} included. Nothing about how this was learned is shared.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
