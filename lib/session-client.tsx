"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { emptySession, type Session } from "./types";

const KEY = "ai-profile-session";

type SessionApi = {
  session: Session | null;
  ready: boolean;
  error: string | null;
  save: (next: Session) => Promise<void>;
};

const SessionContext = createContext<SessionApi | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let id = localStorage.getItem(KEY);
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(KEY, id);
      }
      try {
        const res = await fetch(`/api/session/${id}`);
        if (cancelled) return;
        if (res.ok) {
          setSession((await res.json()) as Session);
        } else {
          const fresh = emptySession(id);
          const created = await fetch(`/api/session/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fresh),
          });
          setSession(created.ok ? ((await created.json()) as Session) : fresh);
        }
        setError(null);
      } catch {
        if (!cancelled) setError("Couldn't open your profile.");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (next: Session) => {
    setSession(next);
    const res = await fetch(`/api/session/${next.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (!res.ok) {
      setError("Couldn't save. Try again.");
      return;
    }
    setError(null);
    setSession((await res.json()) as Session);
  }, []);

  return (
    <SessionContext.Provider value={{ session, ready, error, save }}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used within SessionProvider");
  return value;
}
