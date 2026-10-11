# `/interview` — always have something to check

## The bug, and why it's instructive

Claims only fire when the quiz already found a boundary. So when every answer is *Go ahead*, the interview says it has nothing to ask — **it goes silent exactly when it should be loudest.**

All-permissive isn't an absence of signal. It's the strongest claim the data can make — *"this person would let AI do anything"* — and that claim is almost certainly false. They just never met a scenario extreme enough to find their limit. **Finding it is the interview's entire job.**

> **Rule: `claims()` must never return an empty array.** If the quiz found a boundary, challenge it. If it didn't, go hunting for one.

---

## 1. Claim generation

```js
export function claims(r, a) {
  const c = [];
  const vals    = Object.values(a).filter(v => typeof v === 'number');
  const allHigh = vals.every(v => v >= 4);
  const allLow  = vals.every(v => v <= 2);

  // A — no boundary anywhere. Highest-value case.
  if (allHigh) c.push({
    id:'no_limit', type:'threshold', dimension:'cost',
    text:"You said go ahead to everything I showed you — including a $1,000 booking you couldn't cancel. Is there an amount where you'd want to be asked first?",
    placeholder:'$', escape:'No, I genuinely wouldn’t need asking' });

  if (allLow) c.push({
    id:'no_trust', type:'chips', dimension:'notification',
    text:"You wanted to be asked about everything — even a note only you would read. Is there anything small enough that you'd rather I just did?",
    chips:['Notes to myself','Scheduling','Research and drafts','Nothing, really'] });

  // B — the user contradicted themselves
  if (r.noise >= 2) c.push({
    id:'noise', type:'chips', dimension:'control',
    text:"Two of those situations were almost identical and you answered them differently. Was one a slip, or is there a difference I missed?",
    chips:['One was a slip','There is a difference','Not sure'] });

  // C — ordinary boundary claims, deliberately over-general
  if (r.expFlip >= 1) c.push({
    id:'exposure', type:'yesno', dimension:'exposure',
    text:'You want approval before AI sends anything to another person — is that right?',
    chips:['Only professional ones','Only important ones','Depends who it is','Something else'] });

  if (r.revShift >= 1) c.push({
    id:'reversibility', type:'yesno', dimension:'reversibility',
    text:"You're happy for AI to act whenever something can be undone, even with money involved — right?",
    chips:['Only up to a point','Depends on the amount','Depends on the domain','Something else'] });

  if (r.band[1]) c.push({
    id:'money', type:'yesno', dimension:'cost',
    text:`You'd want to be asked about anything over about $${r.band[1]} — is that right?`,
    chips:['Lower than that','Higher than that','Depends what it is','Something else'] });

  // D — nothing fired cleanly. Challenge the largest movement anyway.
  if (!c.length) {
    const top = [
      { k:'exposure',      e:r.expDrop,  text:'Does it matter to you whether someone else sees what AI does?' },
      { k:'reversibility', e:r.revShift, text:'Does it matter whether something can be undone?' },
      { k:'cost',          e:r.costDrop, text:'Does the amount of money involved change your answer?' },
    ].sort((x,y) => y.e - x.e)[0];
    c.push({ id:top.k, type:'yesno', dimension:top.k, text:top.text });
  }

  return c.slice(0, 3);
}
```

Order matters: A before C. If there's no boundary at all, that's the first thing to ask about.

---

## 2. Three response types

Today there's only `yesno`. Two more are needed.

### `yesno` — existing

`[ Yes ]` `[ Not quite ]` `[ Depends ]` → on anything but Yes, show chips + free text → `/api/refine`.

### `threshold` — new, and the highest-value answer in the product

```
   Is there an amount where you'd want to be asked first?

   ┌──────────────┐
   │  $  2,000    │        [ That's right → ]
   └──────────────┘

   No, I genuinely wouldn't need asking
```

- Numeric input, `$` prefixed, no stepper.
- On submit, **write the band directly**: `band = [value * 0.7, value]`, `confidence.basis = { user_stated: true }`. No LLM call — the user gave you the number.
- The escape link sets `band = [null, null]` and records `cost_not_a_boundary` as a verified item. That's a real finding, not a non-answer.

**This single field converts an unbounded profile into an exportable one.** Without it, an all-permissive user's export reads *"cost is not your boundary"* — which no agent can act on.

### `chips` — new

Single-select, 999px radius, plus an "Other" that reveals free text. On select, send chip + text to `/api/refine` exactly like a `yesno` correction.

---

## 3. What each answer writes

| Claim | Answer | Effect |
|---|---|---|
| `no_limit` | number | `band = [0.7×v, v]`, source `you told me`, confidence 0.9 |
| `no_limit` | escape | item `cost_not_a_boundary`, status `verified` |
| `no_trust` | chips | item granting autonomy in that category, source `you told me` |
| `noise` | "one was a slip" | drop `noise_penalty` from confidence; stop showing the caveat finding |
| `noise` | "there is a difference" | log as an open question; keep the caveat |
| `exposure` / `reversibility` / `money` | Yes | mark `verified`, +0.10 confidence |
| ″ | Not quite / Depends | `/api/refine` → narrower scope, new version, show the correction chip |

**Corrections only ever narrow.** `/api/refine` must never widen a rule — that's in the prompt already, keep it.

---

## 4. The noise claim is worth having for its own sake

When someone answers two near-identical scenarios differently, asking about it is good measurement *and* a strong trust moment. *"I noticed I might have confused you"* is a thing almost no product says, and it signals that the system is checking itself rather than just scoring the user.

---

## 5. Fix the matching inconsistency

`activeFindings()` already handles the all-permissive case — it emits `cost_not_the_boundary`. So today the **finding fires and the claim doesn't**: the profile page says "cost isn't your boundary" while the interview says it has nothing to ask.

Same bug, seen from the other side. Once `claims()` always returns something, these agree again.

---

## 6. Copy when the interview completes

Replace the current dead end. After the last claim:

```
   ✓  Thanks — that helps.

   I've updated 2 things and left 1 as it was.
   [ See my profile → ]
```

And if a `threshold` answer came in:

```
   ✓  Got it — I'll ask you about anything over $2,000.
```

Echoing the number back is the moment the user sees the interview *did* something, which is the whole reason to sit through it.
