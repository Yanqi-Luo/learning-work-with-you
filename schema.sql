create table sessions (
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
);
