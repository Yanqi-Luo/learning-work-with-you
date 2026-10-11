# Phase 2 — history import, archetype, selectable policies

Four additions on top of the working V0:

1. **Landing reorder** — four ways to teach, one place to see the result
2. **`/history`** — import conversations, propose updates, user approves
3. **Archetype** — a shareable type card
4. **Selectable policies** — grouped, checkable, three export formats

---

## 1. Landing reorder

Cards 1–4 are all ways of *teaching*. The profile is the *output*, so it shouldn't compete with them in the same row.

```
   01 AI Personality   02 Tell me      03 Verify &     04 Learn from
      Test                directly        refine          my history
      ~5 min              voice           ~1 min          import

   ┌──────────────────────────────────────────────────────┐
   │  Your AI Profile                                     │
   │  Review, control, and share what AI knows about you. │
   │                                       View profile → │
   └──────────────────────────────────────────────────────┘

        ☐ OK to use my anonymous answers for research
```

Card 4 unlocks with the others (≥6 answers). Four inputs, one destination.

---

## 2. `/history` — learn from conversations

### Framing — this matters

> **Your history shows what happened. Your AI Profile learns what should happen next.**

History is **off-policy**: you only observe situations that actually occurred, under whatever policy the agent was already running. It's strong at *confirming or contradicting* existing items and weak at *discovering* boundaries — rare and high-consequence cases may never appear.

So the page is **"check and update,"** never "learn from scratch." That's honest, and it's also why the scenario test exists.

### Screen

```
              Learn from how you already use AI

   Paste a conversation, or upload an export. I'll look for
   moments that show how you want AI to behave — not what
   you talked about.

   ┌──────────────────────────────────────────────┐
   │  Paste a conversation here…                  │
   │                                              │
   └──────────────────────────────────────────────┘

   [ Find patterns → ]      or upload: ChatGPT · Claude

   🔒 Read once, never stored. Only patterns you approve are kept.
```

**Start with paste.** A real ChatGPT export is a large JSON of hundreds of conversations; parsing it properly is its own project. The extraction logic is identical either way, so ship paste first and add the two export parsers after.

### The extraction call — one shot, ignores content

```
Read this AI conversation history. Find evidence about how this person
wants AI to BEHAVE — not what they talked about.

Look only for:
- moments they told the AI to go ahead, stop, or check first
- corrections or rewrites of AI output
- undoing or reversing an AI action
- repeated approvals of the same kind of action

Return JSON:
{"findings":[{
  "signal":"wants_less_confirmation|wants_more_confirmation|reviews_output|undoes_actions",
  "dimension":"cost|reversibility|exposure|notification",
  "direction":"more_autonomy|less_autonomy",
  "quote":"their exact words, under 20 words",
  "strength":"weak|medium|strong"
}]}

Ignore the subject matter entirely. Found nothing? {"findings":[]}
```

### Review — proposals with evidence, never silent updates

```
   I found 3 patterns in your history

  ┌────────────────────────────────────────────┐
  │  You rarely want confirmation on small     │
  │  code changes                              │
  │                                            │
  │  "just do it, don't ask me every time"     │
  │  — you, 12 Sept                            │
  │                                            │
  │  [ Add to profile ]   Ignore   Ask me      │
  └────────────────────────────────────────────┘
```

| Action | Effect |
|---|---|
| **Add to profile** | becomes a policy item, `source: 'from your history'` |
| **Ignore** | logged as rejected, never shown again |
| **Ask me** | routes to `/interview` with this as the next claim |

**"Ask me" closes the loop between your two strongest mechanics** — a weak history signal becomes a question in the falsification interview.

### Conflicts

If a history finding contradicts an existing item, don't overwrite — surface it:

```
  ┌────────────────────────────────────────────┐
  │  ⚠  This doesn't match what you told me    │
  │                                            │
  │  You said: "ask me before anything         │
  │  non-reversible"                           │
  │  But in your history you approved 4        │
  │  irreversible actions without asking.      │
  │                                            │
  │  [ My rule is right ]  [ Update my rule ]  │
  └────────────────────────────────────────────┘
```

This is the single most interesting card the product can show, and it only exists because you keep explicit instructions and observed behaviour as separate classes.

### Privacy — implement it, don't just claim it

Process in memory. Store the findings, never the raw text. Say so on the page. Uploading your ChatGPT history is a large trust ask, and that one sentence is worth more than a feature.

---

## 3. Archetype

### The honesty constraint, resolved

MBTI works because the label feels like an identity. The problem is a type is normally a **scalar** — and your research says people don't have fixed levels.

**Type on the *shape* of the policy, not the level.** Not *"you score 7/10 on autonomy"* but *"you guard exposure and ignore cost."* A ranking of someone's three dimensions **against each other** is a within-person comparison, which is exactly what 10 answers support. Shareable *and* true.

```js
export function archetype(r, answers) {
  const vals = Object.values(answers).filter(v => typeof v === 'number');
  const mean = vals.reduce((a,b)=>a+b,0) / vals.length;
  const permissive = mean >= 3.5;

  const drivers = [
    { k:'exposure',      label:'Who else sees it',      effect:r.expDrop  },
    { k:'reversibility', label:'Can it be undone',      effect:r.revShift },
    { k:'cost',          label:'What it costs',         effect:r.costDrop },
  ].sort((a,b)=>b.effect-a.effect);

  const TYPES = {
    exposure_hi:      { name:'The Diplomat',  line:'Move fast — but never speak for me.' },
    exposure_lo:      { name:'The Guardian',  line:'Check with me before anyone else sees it.' },
    reversibility_hi: { name:'The Tinkerer',  line:'If I can undo it, go.' },
    reversibility_lo: { name:'The Surgeon',   line:'Reversible is yours. Permanent is mine.' },
    cost_hi:          { name:'The Pilot',     line:"I'll take the big calls. You handle the rest." },
    cost_lo:          { name:'The Treasurer', line:'Watch what it costs.' },
  };
  const t = TYPES[`${drivers[0].k}_${permissive ? 'hi' : 'lo'}`];

  // free modifier — already in your ladder
  const acted    = vals.filter(v => v >= 4);
  const tellRate = acted.length ? vals.filter(v => v === 4).length / acted.length : 0;
  const modifier = tellRate > 0.6 ? 'who wants receipts'
                 : tellRate < 0.2 ? "who'd rather not be bothered" : null;

  return { ...t, modifier, drivers, mean, tellRate };
}
```

**"Who wants receipts" is free data you're discarding.** Choices 5 and 4 are both *act autonomously* — the difference is whether they want to be told. Someone picking 4 everywhere has high autonomy *and* high visibility needs. Second axis, no extra questions.

### Share card — 1080×1350

```
┌────────────────────────────────────┐
│            ( mascot )              │
│                                    │
│          THE DIPLOMAT              │
│    "Move fast — but never          │
│         speak for me."             │
│        who wants receipts          │
│                                    │
│  WHAT DRIVES YOU                   │
│  Who else sees it     ████████░░   │
│  Can it be undone     █████░░░░░   │
│  What it costs        ██░░░░░░░░   │
│                                    │
│  1 in 6 people land here           │
│  aiprofile.xyz                     │
└────────────────────────────────────┘
```

- Styled div → `html-to-image` for download.
- **These bars are a ranking, not scores** — normalized within the person, longest always full. Header must read *"What drives you"*, never *"your autonomy level."*
- Rarity: bucket your n=28 pilot across the six types for a rough denominator, labelled honestly ("based on early users"). It's the strongest share hook MBTI has.
- `Download image` · `Copy link` · `Share`

---

## 4. Policy items

```js
export function policyItems(r, spokenRules, historyRules, tellRate) {
  const items = [];
  const push = (id, move, text, source='learned') => items.push({ id, move, text, source });

  if (r.band[0] > 0)                        push('money_lo','act',   `Go ahead on purchases under $${r.band[0]}`);
  if (r.band[1] && r.band[0] !== r.band[1]) push('money_mid','show', `Show me options between $${r.band[0]} and $${r.band[1]}`);
  if (r.band[1])                            push('money_hi','ask',   `Ask me before spending over $${r.band[1]}`);
  else                                      push('money_any','act',  'Cost alone is not my boundary');

  const EXP = ['writing anything down for me',
               'messaging anyone outside my own notes',
               'messaging anyone outside my team'];
  if (r.expFlip >= 0) push('exposure','ask',   `Ask before ${EXP[r.expFlip]}`);
  else                push('exposure_ok','act','Messaging on my behalf is fine');

  if (r.revShift >= 1)
    push('reversibility','modifier','Treat anything that cannot be undone as one step more cautious');

  if (tellRate > 0.6) push('notify','act','Tell me afterwards when you act on your own');
  if (tellRate < 0.2) push('quiet','act', "Don't narrate routine work — just do it");

  spokenRules .forEach((x,i) => push(`spoken_${i}`,  x.move ?? 'custom', x.text, 'you told me'));
  historyRules.forEach((x,i) => push(`history_${i}`, x.move ?? 'custom', x.text, 'from your history'));

  return items;   // typically 6–11
}
```

### UI — grouped, selectable

```
  YOUR POLICIES                       Select all · Clear

  GO AHEAD
  ☑  Go ahead on purchases under $50                 learned
  ☑  Tell me afterwards when you act on your own     learned

  SHOW ME FIRST
  ☑  Show me options between $50 and $250            learned

  ASK ME
  ☑  Ask me before spending over $250                learned
  ☑  Ask before messaging anyone outside my team     confirmed by you
  ☐  Ask me before anything non-reversible           you told me

  ALWAYS APPLIES
  ☑  Treat anything that cannot be undone as one
     step more cautious                              learned

  FROM YOUR HISTORY
  ☑  Skip confirmation on small code changes         from your history

┌─ sticky ─────────────────────────────────────────────┐
│  7 of 8 selected      Short ▾      [ Generate → ]    │
└──────────────────────────────────────────────────────┘
```

Group headers are clickable to toggle their group. Source chip 12px muted: `learned` · `you told me` · `confirmed by you` · `from your history`. Default: all checked.

**Grouping by move turns a list of notes into something that reads like a policy.**

---

## 5. Export — three formats

**Short** (default, paste-ready):

```
HOW TO WORK WITH ME

- Go ahead on purchases under $50.
- Show me options between $50 and $250.
- Ask me before spending over $250.
- Ask before messaging anyone outside my team.
- Treat anything that cannot be undone as one step more cautious.
- Tell me afterwards when you act on your own.
```

**Detailed** (for a system prompt) — same content grouped under `MONEY` / `REACHING OTHER PEOPLE` / `WHEN IT CAN'T BE UNDONE` / `KEEPING ME IN THE LOOP`, two sentences each.

**Structured** (the future API payload):

```json
{
  "version": "0.1",
  "generated_at": "2026-10-11T00:00:00Z",
  "policies": [
    { "id":"money_lo",  "when":{ "action":"purchase","amount_lt":50 },          "move":"act" },
    { "id":"money_mid", "when":{ "action":"purchase","amount_between":[50,250]},"move":"show_plan" },
    { "id":"money_hi",  "when":{ "action":"purchase","amount_gt":250 },         "move":"ask" },
    { "id":"exposure",  "when":{ "recipient":"external" },                      "move":"ask" },
    { "id":"reversibility","when":{ "reversible":false }, "modifier":{ "shift_steps":-1 } }
  ],
  "default": { "move":"ask" }
}
```

**Build the JSON now even though nothing consumes it.** Twenty minutes, it's what the API will serve, and it's what makes "connect to your agents" credible when someone asks how this scales past copy-paste.

**Rules:** assemble in code, never by the model · numbers not adjectives · only selected items · `[ Copy ]` → `✓ Copied` 2s · underneath, quietly: *"Only the 7 policies you selected are included. Nothing about how this was learned is shared."*

---

## 6. Page order

```
1  Mascot + summary sentence
2  ── TYPE CARD ──      archetype · drivers · share
3  WHAT I NOTICED        conditional findings
4  ⚠ NEEDS YOUR CALL     conflicts, if any
5  YOUR POLICIES         grouped, selectable
6  sticky footer         count · format · Generate
```

Type card second — it's the hook and the share surface. Conflicts above policies, because an unresolved contradiction should be answered before the user exports a profile that contains it.

---

## 7. Fix while you're in there

**The `$0` bug.** Your screenshot reads *"Under $0 you let AI act"* — that's `band[0] === 0`, meaning they flipped at the first rung:

```js
band[0] === 0
  ? 'You want a say on almost any amount.'
  : `Under $${band[0]} you let AI act. At $${band[1]} you wanted a check.`
```

**The money finding repeats the summary verbatim.** Suppress a finding whose headline already appears in the summary sentence.

**`/api/narrate` is describing its own inputs** — *"the drop was 2 steps, larger than the 1-step drop."* Add to the prompt: *never mention steps, drops, scores, or how the measurement worked. Write as if you simply noticed.*

**Reversibility didn't fire** in that screenshot even though the user's typed rule is about exactly that. Check whether `revShift >= 2` is too high a bar — with a 5-point ladder, a 1-step shift is already meaningful. Consider `>= 1` for the finding and keep `>= 2` for the archetype.
