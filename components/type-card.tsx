"use client";

import { useRef, useState } from "react";
import { driverWidths, type Archetype } from "@/lib/archetype";

function CardFace({ archetype, large = false }: { archetype: Archetype; large?: boolean }) {
  const drivers = driverWidths(archetype.drivers);
  return (
    <div className={`flex h-full flex-col items-center bg-bg text-center text-ink ${large ? "px-16 py-16" : "px-6 py-8"}`}>
      <img
        src="/mascot/guardian.png"
        alt=""
        width={1448}
        height={1086}
        className="guardian-portrait"
        style={{ width: large ? 520 : 240 }}
      />
      <p className={`mt-6 font-semibold tracking-[0.14em] ${large ? "text-[28px]" : "text-[13px]"}`}>{archetype.name.toUpperCase()}</p>
      <p className={`mt-3 max-w-[16ch] font-semibold leading-tight ${large ? "text-[40px]" : "text-[22px]"}`}>“{archetype.line}”</p>
      {archetype.modifier ? <p className={`mt-3 text-muted ${large ? "text-[22px]" : "text-[14px]"}`}>{archetype.modifier}</p> : null}
      <div className={`mt-10 w-full text-left ${large ? "max-w-[640px]" : ""}`}>
        <p className={`font-medium tracking-wide text-muted ${large ? "text-[18px]" : "text-[12px]"}`}>WHAT DRIVES YOU</p>
        <div className="mt-4 flex flex-col gap-3">
          {drivers.map((driver) => (
            <div key={driver.k}>
              <div className="flex items-center justify-between gap-4">
                <span className={large ? "text-[22px]" : "text-[14px]"}>{driver.label}</span>
              </div>
              <div className={`mt-1 w-full overflow-hidden rounded-full bg-hairline ${large ? "h-3" : "h-1.5"}`}>
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.round(driver.width * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className={`mt-auto pt-8 text-muted ${large ? "text-[18px]" : "text-[13px]"}`}>About 1 in 6, based on early users</p>
    </div>
  );
}

export function TypeCard({ archetype }: { archetype: Archetype }) {
  const shotRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("");

  async function download() {
    if (!shotRef.current) return;
    const { toPng } = await import("html-to-image");
    const url = await toPng(shotRef.current, { width: 1080, height: 1350, pixelRatio: 1, cacheBust: true });
    const link = document.createElement("a");
    link.href = url;
    link.download = "ai-profile-type.png";
    link.click();
  }

  async function copyLink() {
    const url = `${window.location.origin}/profile`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const area = document.createElement("textarea");
      area.value = url;
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    setStatus("Link copied");
    window.setTimeout(() => setStatus(""), 2000);
  }

  async function share() {
    const url = `${window.location.origin}/profile`;
    const payload = { title: archetype.name, text: archetype.line, url };
    if (navigator.share) {
      try {
        await navigator.share(payload);
        return;
      } catch {
        return;
      }
    }
    await copyLink();
  }

  return (
    <section className="mt-10">
      <div className="overflow-hidden rounded-[20px] border border-hairline bg-bg">
        <CardFace archetype={archetype} />
        <div className="flex flex-wrap items-center justify-center gap-4 border-t border-hairline px-5 py-4">
          <button type="button" onClick={() => void download()} className="rounded-[12px] bg-ink px-4 py-2 text-[14px] font-medium text-white">
            Download image
          </button>
          <button type="button" onClick={() => void copyLink()} className="text-[14px] text-accent">
            Copy link
          </button>
          <button type="button" onClick={() => void share()} className="text-[14px] text-accent">
            Share
          </button>
          {status ? <span className="text-[13px] text-muted">{status}</span> : null}
        </div>
      </div>
      <div ref={shotRef} className="pointer-events-none fixed top-0 -left-[4000px]" style={{ width: 1080, height: 1350 }} aria-hidden>
        <CardFace archetype={archetype} large />
      </div>
    </section>
  );
}
