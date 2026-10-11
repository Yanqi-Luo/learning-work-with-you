import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { Pool } from "pg";
import { emptyHistory, emptySession, type HistoryState, type Session } from "./types";

const CREATE_SQL = `
create table if not exists sessions (
  id         text primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  answers    jsonb not null default '{}',
  reasons    jsonb not null default '{}',
  rules      jsonb not null default '[]',
  verified   jsonb not null default '{}',
  summary    text,
  consent    boolean not null default false,
  history    jsonb not null default '{}',
  unchecked  jsonb not null default '[]'
)`;

const ALTER_SQL = `
alter table sessions add column if not exists history jsonb not null default '{}';
alter table sessions add column if not exists unchecked jsonb not null default '[]';
`;

const filePath = path.join(process.cwd(), ".data", "sessions.json");

type Store = Record<string, Session>;

const globalForDb = globalThis as unknown as { pool?: Pool; ready?: Promise<void> };

function pool() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!globalForDb.pool) globalForDb.pool = new Pool({ connectionString: url });
  return globalForDb.pool;
}

async function ensureTable() {
  const db = pool();
  if (!db) return;
  if (!globalForDb.ready) {
    globalForDb.ready = db.query(CREATE_SQL).then(() => db.query(ALTER_SQL)).then(() => undefined);
  }
  await globalForDb.ready;
}

async function readFileStore(): Promise<Store> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as Store;
  } catch {
    return {};
  }
}

async function writeFileStore(store: Store) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await writeFile(tmp, JSON.stringify(store));
  await rename(tmp, filePath);
}

function rowToSession(row: {
  id: string;
  created_at: Date | string;
  updated_at: Date | string;
  answers: Session["answers"];
  reasons: Session["reasons"];
  rules: Session["rules"];
  verified: Session["verified"];
  summary: string | null;
  consent: boolean;
  history?: HistoryState;
  unchecked?: string[];
}): Session {
  const history = row.history ?? emptyHistory();
  return {
    id: row.id,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
    answers: row.answers ?? {},
    reasons: row.reasons ?? {},
    rules: row.rules ?? [],
    verified: row.verified ?? {},
    summary: row.summary,
    consent: Boolean(row.consent),
    history: {
      rejected: history.rejected ?? [],
      pending: history.pending ?? [],
      proposals: history.proposals ?? [],
    },
    unchecked: row.unchecked ?? [],
  };
}

export async function getSession(id: string): Promise<Session | null> {
  const db = pool();
  if (db) {
    await ensureTable();
    const result = await db.query("select * from sessions where id = $1", [id]);
    return result.rows[0] ? rowToSession(result.rows[0]) : null;
  }
  const store = await readFileStore();
  return store[id] ? rowToSession({ ...store[id], created_at: store[id].created_at, updated_at: store[id].updated_at }) : null;
}

export async function putSession(id: string, input: Partial<Session>): Promise<Session> {
  const existing = (await getSession(id)) ?? emptySession(id);
  const next: Session = {
    ...existing,
    ...input,
    id,
    answers: input.answers ?? existing.answers,
    reasons: input.reasons ?? existing.reasons,
    rules: input.rules ?? existing.rules,
    verified: input.verified ?? existing.verified,
    summary: input.summary === undefined ? existing.summary : input.summary,
    consent: input.consent ?? existing.consent,
    history: input.history ?? existing.history ?? emptyHistory(),
    unchecked: input.unchecked ?? existing.unchecked ?? [],
    created_at: existing.created_at,
    updated_at: new Date().toISOString(),
  };

  const db = pool();
  if (db) {
    await ensureTable();
    await db.query(
      `insert into sessions (id, created_at, updated_at, answers, reasons, rules, verified, summary, consent, history, unchecked)
       values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10::jsonb, $11::jsonb)
       on conflict (id) do update set
         updated_at = excluded.updated_at,
         answers = excluded.answers,
         reasons = excluded.reasons,
         rules = excluded.rules,
         verified = excluded.verified,
         summary = excluded.summary,
         consent = excluded.consent,
         history = excluded.history,
         unchecked = excluded.unchecked`,
      [
        next.id,
        next.created_at,
        next.updated_at,
        JSON.stringify(next.answers),
        JSON.stringify(next.reasons),
        JSON.stringify(next.rules),
        JSON.stringify(next.verified),
        next.summary,
        next.consent,
        JSON.stringify(next.history),
        JSON.stringify(next.unchecked),
      ],
    );
    return next;
  }

  const store = await readFileStore();
  store[id] = next;
  await writeFileStore(store);
  return next;
}
