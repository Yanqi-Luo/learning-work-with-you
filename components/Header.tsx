"use client";

import Link from "next/link";
import { useSession } from "@/lib/session-client";

export function Header() {
  const { session } = useSession();
  const waiting = session?.history?.proposals.length ?? 0;

  return (
    <header className="mx-auto flex w-full max-w-[920px] items-center justify-between px-6 py-6">
      <Link href="/" className="text-[15px] font-semibold tracking-tight text-ink">
        AI Profile
      </Link>
      {waiting > 0 ? (
        <Link href="/history" className="rounded-full bg-warm px-3 py-1 text-[13px] text-ink">
          {waiting} pattern{waiting === 1 ? "" : "s"} to review
        </Link>
      ) : null}
    </header>
  );
}
