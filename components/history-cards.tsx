"use client";

import { conflictsWith, findingHeadline } from "@/lib/history";
import type { HistoryFinding } from "@/lib/types";
import type { PolicyItem } from "@/lib/policy";

export function HistoryCards({
  proposals,
  items,
  onDecide,
}: {
  proposals: HistoryFinding[];
  items: PolicyItem[];
  onDecide: (finding: HistoryFinding, decision: "add" | "ignore" | "ask" | "keep" | "update", conflict?: PolicyItem | null) => void;
}) {
  if (proposals.length === 0) return null;

  return (
    <div className="mt-6 flex flex-col gap-4">
      {proposals.map((finding) => {
        const conflict = conflictsWith(finding, items);
        const key = `${finding.signal}:${finding.quote}`;
        if (conflict) {
          return (
            <div key={key} className="rounded-[20px] border border-hairline bg-warm px-5 py-5">
              <p className="text-[13px] font-medium text-ink">This doesn&apos;t match what you told me</p>
              <p className="mt-3 text-[16px]">You said: “{conflict.text}”</p>
              <p className="mt-2 text-[16px] text-muted">But in your history: “{finding.quote}”</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button type="button" onClick={() => onDecide(finding, "keep", conflict)} className="rounded-[12px] border border-hairline bg-surface px-4 py-2 text-[14px]">
                  My rule is right
                </button>
                <button type="button" onClick={() => onDecide(finding, "update", conflict)} className="rounded-[12px] bg-ink px-4 py-2 text-[14px] text-white">
                  Update my rule
                </button>
              </div>
            </div>
          );
        }
        const times =
          finding.mentions === 2
            ? "you, twice in this conversation"
            : finding.mentions && finding.mentions > 2
              ? `you, ${finding.mentions} times in this conversation`
              : "you";
        return (
          <div key={key} className="rounded-[20px] border border-hairline bg-surface px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <p className="text-[18px] font-semibold">{findingHeadline(finding)}</p>
              <span className="shrink-0 rounded-full border border-hairline px-2 py-0.5 text-[12px] text-muted">{finding.strength}</span>
            </div>
            <p className="mt-3 text-[16px] text-muted">“{finding.quote}” — {times}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" onClick={() => onDecide(finding, "add")} className="rounded-[12px] bg-ink px-4 py-2 text-[14px] text-white">
                Add to profile
              </button>
              <button type="button" onClick={() => onDecide(finding, "ignore")} className="text-[14px] text-muted">
                Ignore
              </button>
              <button type="button" onClick={() => onDecide(finding, "ask")} className="text-[14px] text-accent">
                Ask me
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
