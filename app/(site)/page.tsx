"use client";

import Link from "next/link";
import { Mascot } from "@/components/Mascot";
import { useSession } from "@/lib/session-client";

const cards = [
  {
    n: "01",
    title: "AI Personality Test",
    meta: "~5 min",
    body: "Discover how you want AI to behave in real situations.",
    action: "Start test",
    href: "/test",
  },
  {
    n: "02",
    title: "Tell me directly",
    meta: "voice",
    body: "Tell AI a rule, preference, or boundary directly.",
    action: "Tell AI",
    href: "/tell",
  },
  {
    n: "03",
    title: "Verify & refine",
    meta: "~1 min",
    body: "Check what AI thinks it learned about you.",
    action: "Start interview",
    href: "/interview",
  },
  {
    n: "04",
    title: "Learn from my history",
    meta: "import",
    body: "Check conversations you already had, then approve what should stick.",
    action: "Import",
    href: "/history",
  },
];

function Lock() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="inline-block">
      <rect x="2.5" y="6" width="9" height="6.5" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 6V4.2a2.5 2.5 0 0 1 5 0V6" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export default function LandingPage() {
  const { session, ready, save } = useSession();
  const unlocked = Object.keys(session?.answers ?? {}).length >= 6;

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col items-center px-6 pb-24">
      <div className="mt-6 flex w-full flex-col items-center gap-8 md:flex-row md:items-center md:justify-between md:gap-12">
        <div className="max-w-[460px] text-center md:text-left">
          <h1 className="text-[36px] font-semibold leading-[1.12] tracking-tight sm:text-[44px]">
            Teach AI your working style once. Use it everywhere.
          </h1>
          <p className="mt-5 text-[18px] font-semibold leading-snug">
            Not what you want AI to make — how you want it to work.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">
            You can&apos;t just write these boundaries down. Most people find them in the moment.
          </p>
        </div>
        <Mascot size={280} />
      </div>

      <div className="mt-14 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, index) => {
          const locked = index > 0 && !unlocked;
          const inner = (
            <>
              <p className="text-[13px] text-muted">{card.n}</p>
              <h2 className="mt-3 text-[18px] font-semibold leading-tight">{card.title}</h2>
              <p className="mt-1 text-[13px] text-muted">{card.meta}</p>
              <p className="mt-3 text-[14px] leading-snug text-muted">{card.body}</p>
              <p className="mt-auto pt-6 text-[14px] font-medium text-accent">
                {locked ? (
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <Lock /> after the test
                  </span>
                ) : (
                  <span>{card.action} →</span>
                )}
              </p>
            </>
          );
          const className = `flex min-h-[200px] flex-col rounded-[20px] border border-hairline bg-surface p-4 text-left transition duration-300 ${
            locked ? "opacity-45" : "hover:-translate-y-0.5"
          }`;

          if (locked) {
            return (
              <div key={card.n} className={className} aria-disabled="true">
                {inner}
              </div>
            );
          }

          return (
            <Link key={card.n} href={card.href} className={className}>
              {inner}
            </Link>
          );
        })}
      </div>

      <p className="mt-8 text-center text-[14px] text-muted">
        Works in <span className="font-medium text-ink">ChatGPT</span>
        <span className="px-1.5">·</span>
        <span className="font-medium text-ink">Claude</span>
        <span className="px-1.5">·</span>
        <span className="font-medium text-ink">Cursor</span>
        <span className="px-1.5">·</span>
        and any agent you use
      </p>

      <Link
        href="/profile"
        className="mt-4 flex w-full items-center justify-between gap-6 rounded-[20px] border border-hairline bg-surface px-6 py-5 text-left hover:-translate-y-0.5"
      >
        <span>
          <span className="block text-[20px] font-semibold">Your AI Profile</span>
          <span className="mt-1 block text-[14px] text-muted">Review, control, and share what AI knows about you.</span>
        </span>
        <span className="shrink-0 text-[14px] font-medium text-accent">View profile →</span>
      </Link>

      <label className="mt-10 flex items-start gap-3 text-[14px] text-muted">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-accent"
          checked={Boolean(session?.consent)}
          disabled={!ready || !session}
          onChange={(event) => {
            if (!session) return;
            void save({ ...session, consent: event.target.checked });
          }}
        />
        <span>OK to use my anonymous answers for research</span>
      </label>

    </div>
  );
}
