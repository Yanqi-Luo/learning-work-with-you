# AI Profile — simplified build spec

Everything works. Nothing faked. Four screens, one table, three one-shot LLM calls.

**Stack:** Next.js (App Router) + Tailwind · Postgres (one table) · `webkitSpeechRecognition` · one LLM provider

**Principle throughout:** *the arithmetic decides, the model writes.* Which findings appear, where the thresholds sit, which claim to challenge — all deterministic. The model only turns facts into sentences.

---

## 1. Data — one table

```sql
create table sessions (
  id         text primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  answers    jsonb not null default '{}',  -- { "cost_1": 5, "exp_manager": 2 }
  reasons    jsonb not null default '{}',  -- { "cost_3": ["Cost"], "_text": {...} }
  rules      jsonb not null default '[]',  -- [ { text, source, created_at } ]
  verified   jsonb not null default '{}',  -- { "exposure": { answer, correction } }
  summary    text,                          -- cached narration
  consent    boolean not null default false
);
```

Write the whole object on each step: `PUT /api/session/:id`. No migrations beyond this.

**Keep `consent`.** One column, and the only thing that can't be added retroactively — answers collected without it can never enter a paper or a licensed dataset.

---

## 2. Scenarios

```js
export const SCENARIOS = [
  { id:'cost_1', dim:'cost', delta:0, icon:'✈',
    text:"You're taking a weekend trip. Your AI finds a hotel matching your usual preferences and budget. It can reserve it now with free cancellation until tomorrow." },
  { id:'exp_private', dim:'exposure', level:1, icon:'✎',
    text:"Your AI drafts a note summarising a difficult work decision for your own private notes. No one else will see it." },
  { id:'rev_yes', dim:'reversibility', reversible:true, icon:'✈',
    text:"Your flight is delayed. Your AI finds a nonstop replacement $80 more. The new ticket is fully refundable for 24 hours." },
  { id:'cost_2', dim:'cost', delta:50, icon:'✈',
    text:"That hotel is sold out. Your AI finds a better-rated alternative that costs $50 more, still fully refundable until tomorrow." },
  { id:'exp_manager', dim:'exposure', level:2, icon:'✉',
    text:"Your AI drafts a message to your manager explaining a project will be delivered a day late. The facts are accurate and the tone matches your usual style." },
  { id:'ctrl_a', dim:'control', pair:'ctrl', icon:'✈',
    text:"Your AI can switch your hotel to a refundable option for $40 more." },
  { id:'cost_3', dim:'cost', delta:250, adaptive:'cost_3b', icon:'✈',
    text:"Your AI finds a much better hotel that costs $250 more than your original option, still fully refundable until tomorrow." },
  { id:'rev_no', dim:'reversibility', reversible:false, icon:'✈',
    text:"Your flight is delayed. Your AI finds a nonstop replacement $80 more. This time the new ticket is non-refundable once booked." },
  { id:'exp_customer', dim:'exposure', level:3, icon:'✉',
    text:"Your AI drafts a message to a customer explaining their delivery will be delayed. The information is accurate and it follows your usual style." },
  { id:'ctrl_b', dim:'control', pair:'ctrl', icon:'✈',
    text:"Your AI finds an alternative hotel with free cancellation that costs $40 more." },
];

export const COST_3B = { id:'cost_3b', dim:'cost', delta:1000, icon:'✈',
  text:"Your AI finds an exceptional hotel that costs $1,000 more than your original option, still fully refundable until tomorrow." };

export const CHOICES = [
  { v:5, label:'Go ahead',               sub:'Do it without checking.' },
  { v:4, label:'Go ahead, then tell me', sub:'Do it, let me know after.' },
  { v:3, label:'Show me first',          sub:'Prepare it, let me approve.' },
  { v:2, label:'Ask me',                 sub:"Don't assume — check with me." },
  { v:1, label:"Don't do this",          sub:'Not with AI.' },
];

export const CHIPS = ['Cost','Easy to undo','Hard to undo','Other people','Privacy','Uncertainty','Something else'];
```

**This array order is the presentation order. Do not sort it.** Cost sits at 1/4/7, exposure at 2/5/9. Consecutive ladder steps make the manipulation visible, and people start answering consistently instead of honestly. Controls at 6 and 10 so the second isn't recognised.

If `cost_3 >= 4`, serve `COST_3B` before advancing — it replaces, it doesn't add.

---

## 3. Inference — deterministic

```js
export function infer(a) {
  const pts = [{d:0,v:a.cost_1},{d:50,v:a.cost_2},{d:250,v:a.cost_3},
               ...(a.cost_3b!=null?[{d:1000,v:a.cost_3b}]:[])].filter(p=>p.v!=null);

  const i = pts.findIndex(p => p.v <= 3);
  const band = i === 0 ? [0,0] : i > 0 ? [pts[i-1].d, pts[i].d] : [pts.at(-1).d, null];

  return {
    band,
    revShift: a.rev_yes - a.rev_no,                       // + = cautious when permanent
    expFlip:  [a.exp_private,a.exp_manager,a.exp_customer].findIndex(v=>v<=3),
    costDrop: pts[0].v - pts.at(-1).v,
    expDrop:  a.exp_private - a.exp_customer,
    noise:    Math.abs(a.ctrl_a - a.ctrl_b),
  };
}

// which findings fire — deterministic. prose comes from /api/narrate.
export function activeFindings(r) {
  const f = [];
  if (r.expDrop > r.costDrop && r.expDrop >= 2) f.push('exposure_over_cost');
  if (r.revShift >= 2)                          f.push('reversibility');
  if (r.band[1] != null && r.band[0] !== r.band[1]) f.push('money_band');
  else if (r.band[1] == null)                   f.push('cost_not_the_boundary');
  if (r.expFlip === 2)                          f.push('internal_ok_external_not');
  if (r.noise >= 2)                             f.push('noisy_caveat');
  return f.slice(0, 4);
}
```

**Never emit a score.** No "Autonomy: 73%".

---

## 4. The three LLM calls

All single-shot. JSON in, JSON out. No tools, no chaining, no memory. Small fast model.

### `POST /api/extract` — speech → rules

```
Extract explicit AI-behaviour rules from the user's statement.
Return JSON only: {"rules":[{"text":"...","action":"act|act_report|show_first|ask|never"}]}
- One object per distinct rule. Usually 1-3.
- "text" = the rule in clean first person, under 12 words.
- Never invent a rule the user didn't state.
- Nothing actionable? {"rules":[]}
```

Fallback on parse failure: store the raw transcript as one rule with `source:'spoken'`. Never lose the user's words.

### `POST /api/narrate` — facts → prose

Input is the inference result plus the list of active finding keys. **The model does not decide what is true — it only writes what it's given.**

```
Write a user's AI-working-style profile. Warm, plain, second person. No jargon.
Return JSON only:
{"summary":"one sentence","findings":[{"h":"short headline","b":"one or two sentences"}]}

Rules:
- Write ONLY the findings listed in active_findings, in that order.
- Use the exact numbers given. Never invent or round them.
- Never assign a score, percentage, or personality label.
- Never call the user risk-averse, controlling, cautious or anxious. Describe the preference, not the person.
```

Input:
```json
{ "active_findings":["exposure_over_cost","reversibility","money_band"],
  "band":[50,250], "rev_shift":2, "exp_flip":2 }
```

### `POST /api/refine` — correction → revised rule

Called when the user answers anything but Yes in the interview.

```
The user is correcting an assumption about how they want AI to behave.
Return JSON only: {"revised":"the corrected rule, first person, under 15 words",
                   "narrowed_from":"what was too broad"}
Never widen the rule. Corrections only ever make it more specific.
```

Input: the claim text, their button answer, selected chips, free text.

---

## 5. UI

### 5.0 Tokens

```css
--bg:#FBFAF8  --surface:#FFF  --ink:#1F2937  --muted:#6B7280  --hairline:#E8E3DC
--accent:#4F7FD1  --accent-bg:#EEF3FB  --warm:#F7EDE2  --go:#2E7D5B

radius 20px cards · 12px buttons · 999px chips
space  8/12/16/24/40/64
type   Inter · display 48 · h2 28 · body 16 · meta 13
width  720px single column (profile list 920px)
```

Header: logo left, nothing right. **No sidebar on any screen.** Mascot ≤180px, never beside body copy.

### 5.1 `/` Landing

```
                   ┌──────────┐
                   │  mascot  │   180px
                   └──────────┘

           Teach AI your working style once.
                  Use it everywhere.

     Teach AI your boundaries before it crosses them.

 ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
 │    ◇     │ │    ◆     │ │    ◈     │ │    ◉     │
 │ AI       │ │ Tell Me  │ │ Verify & │ │ Your     │
 │Personality│ │ Directly │ │ Refine   │ │ Profile  │
 │ Test     │ │          │ │ Interview│ │          │
 │          │ │          │ │          │ │          │
 │ ~5 min → │ │ voice  → │ │ ~1 min → │ │ view   → │
 └──────────┘ └──────────┘ └──────────┘ └──────────┘

   ☐ OK to use my anonymous answers for research

        Already use AI? Learn from my history →
```

Cards 2–4: **45% opacity, lock glyph, caption "after the test"** until `answers` has ≥6 keys. Then fade in. One clickable thing on first visit.

Card: 200×180, radius 20, 1px hairline, `--surface`. Hover lifts 2px.

History link is a dead `<a>` — keep it, it shows direction.

### 5.2 `/test`

**Full-bleed. No header, no mascot, no nav.**

```
  ● ● ● ○ ○ ○ ○ ○ ○ ○                         Exit ✕

                   ✈  Travel

      Your flight is delayed. Your AI finds a
      nonstop replacement $80 more. The new
      ticket is fully refundable for 24 hours.

                What should it do?

 ┌────────────────────────────────────────────┐
 │ Go ahead                                   │
 │ Do it without checking.                    │
 ├────────────────────────────────────────────┤
 │ Go ahead, then tell me                     │
 ├────────────────────────────────────────────┤
 │ Show me first                              │
 ├────────────────────────────────────────────┤
 │ Ask me                                     │
 ├────────────────────────────────────────────┤
 │ Don't do this                              │
 └────────────────────────────────────────────┘
```

- Dots only. **Never a percentage** — it reads as a form.
- Scenario text 24px, 1.5 line-height, max 520px.
- Choice rows 72px, full width, hairline between. Label 17/600, sub 14 muted. Hover tints `--accent-bg`.

On select the row tints and holds 200ms, then the panel **replaces** the choices:

```
      What mattered most here?        skip →

  (Cost) (Easy to undo) (Hard to undo)
  (Other people) (Privacy) (Uncertainty)
  (Something else)

  ┌──────────────────────────────────┐
  │ anything else?                   │
  └──────────────────────────────────┘

              [  Next  →  ]
```

Chips toggle, multi-select, 999px radius. Both chips and text optional.

Exit ✕ confirms. Back arrow allowed; overwrites.
Last answer → `/profile`, which animates empty → filled.

### 5.3 `/tell`

```
                ┌──────────┐
                │  mascot  │   scales 1.0–1.08 with amplitude
                └──────────┘

      Tell me how you want AI to work with you.

               ╭──────────╮
               │    🎤    │     88px circle, --accent
               ╰──────────╯
                tap to speak

             or type instead →
```

`webkitSpeechRecognition`, `continuous:false`, `interimResults:true`. Show interim text greyed below the button.

States `idle → listening → review → saved`. **Review is mandatory:**

```
  Here's what I heard

  "For work emails always show me the message
   before sending, but for calendar changes you
   can usually just go ahead."

  I'll store this as:
  ┌─────────────────────────────────────────┐
  │ ✎ Show me work emails before sending    │
  │ ✎ Go ahead on routine calendar changes  │
  └─────────────────────────────────────────┘

  [ Add to my profile ]  Record again  Discard
```

Rules come from `/api/extract`, each inline-editable. Save as `source:'spoken'`.

### 5.4 `/interview`

Three claims from `claims()`, one at a time. **One is deliberately over-general** — that's the mechanism, not a bug.

```js
export function claims(r) {
  const c = [];
  if (r.expFlip >= 1) c.push({ id:'exposure',
    text:'You want approval before AI sends anything to another person — is that right?',
    chips:['Only professional ones','Only important ones','Depends who it is','Something else'] });
  if (r.revShift >= 1) c.push({ id:'reversibility',
    text:"You're happy for AI to act whenever something can be undone, even with money involved — right?",
    chips:['Only up to a point','Depends on the amount','Depends on the domain','Something else'] });
  if (r.band[1]) c.push({ id:'money',
    text:`You'd want to be asked about anything over about $${r.band[1]} — is that right?`,
    chips:['Lower than that','Higher than that','Depends what it is','Something else'] });
  return c.slice(0,3);
}
```

```
 ┌──────┐
 │mascot│   I think I've learned something about you.
 └──────┘
           You want approval before AI sends anything
           to another person — is that right?

           [  Yes  ]  [ Not quite ]  [ Depends ]
```

On **Not quite / Depends** → chips + free text → `POST /api/refine` → show the correction landing:

```
      ┌──────────────────────────────────────┐
      │ ✓ Updated                            │
      │   anything to another person         │
      │   → professional messages only       │
      └──────────────────────────────────────┘
```

Green `--go` border, 400ms fade-in. **This is the moment the product earns trust — the user watches their own profile get corrected.** Don't skip the animation.

### 5.5 `/profile`

**Order is load-bearing. Do not reorder.**

```
┌──────────────────────────────────────────────────┐
│ [mascot 96]   Your AI Profile                    │
│                                                  │
│ You want AI to move quickly when mistakes are    │
│ easy to fix, but you draw a line around actions  │
│ that affect other people.                        │
└──────────────────────────────────────────────────┘

  WHAT I NOTICED
┌──────────────────────────────────────────────────┐
│ You care more about exposure than cost.          │
│ You let AI spend meaningfully more without       │
│ checking, then wanted approval the moment        │
│ another person was involved.                     │
├──────────────────────────────────────────────────┤
│ Reversibility earns AI a lot more freedom.       │
├──────────────────────────────────────────────────┤
│ Your money line sits between $50 and $250.       │
└──────────────────────────────────────────────────┘

  YOUR RULES
┌──────────────────────────────────────────────────┐
│ Ask before messaging anyone outside my team      │
│ learned · confirmed by you                       │
├──────────────────────────────────────────────────┤
│ Show me work emails before sending               │
│ you told me                                      │
└──────────────────────────────────────────────────┘

┌─ sticky ─────────────────────────────────────────┐
│                          [ Copy my profile ]     │
└──────────────────────────────────────────────────┘
```

Findings cards: `--warm` background, headline 20/600, body 16 muted.
Rule rows: text 16, meta 13 muted (`learned` · `you told me` · `confirmed by you`).

**Empty state — same page, slots visible:**

```
  WHAT I NOTICED
┌──────────────────────────────────────────────────┐
│  ░░░░░░░░  Nothing yet                           │
│  Answer a few scenarios and I'll start noticing. │
│                          [ Start the test → ]    │
└──────────────────────────────────────────────────┘
```

Watching the page fill in **is** the progress indicator.

### 5.6 Mascot lines

| When | Line |
|---|---|
| New | "Hi — teach me how you'd like AI to work with you." |
| During quiz | *(absent)* |
| After quiz | "I'm starting to see how you decide." |
| Interview start | "I have a few assumptions I'd like to check." |
| After interview | "Your profile's ready." |

---

## 6. Export

```
HOW TO WORK WITH ME

- Go ahead on routine, reversible, private tasks.
- Ask me before messaging anyone outside my team.
- Purchases: go ahead under $50. Ask above $250.
- Treat anything that can't be undone as one step more cautious.
- Show me work emails before sending.
```

Assembled from rules + thresholds in code — **not** by the model. **Numbers, never adjectives.** "within my usual range" is unexecutable.

`[ Copy ]` writes to clipboard, button swaps to `✓ Copied` for 2s.

---

## 7. Build order

| | | |
|---|---|---|
| 0:00 | 0:20 | Scaffold · table · SCENARIOS · landing with 4 cards + consent |
| 0:20 | 1:00 | **`/test`** — choices, chips panel, adaptive rung, session write |
| 1:00 | 1:30 | **`/profile`** — `infer()`, `/api/narrate`, export, copy |
| 1:30 | 1:55 | **`/interview`** — claims, `/api/refine`, correction chip |
| 1:55 | 2:20 | **`/tell`** — Web Speech, `/api/extract`, review state |

Dependency order: profile must exist before interview and tell have anything to act on.

**If `/api/narrate` is slow or flaky**, ship template strings for the findings — the arithmetic already decides which fire, so the prose is the only thing at risk. Keep `/api/extract`; that one has no deterministic substitute.
