# Export — change spec

Generate currently writes to the clipboard and shows nothing. Three fixes: **show the output**, **normalise the voice**, **fix the misfiled move**.

---

## 1. Show the output in place

```
  ┌──────────────────────────────────────────────────┐
  │  Your profile            [ Short ▾ ]   [ Copy ]  │
  ├──────────────────────────────────────────────────┤
  │                                                  │
  │  HOW TO WORK WITH ME                             │
  │                                                  │
  │  - Ask me before spending more than $500.        │
  │  - Confirm with me before sharing anything       │
  │    sensitive.                                    │
  │  - Tell me afterwards when you act on your own.  │
  │  - Ask me first before anything that can't be    │
  │    undone.                                       │
  │  - Go ahead when something can be undone, even   │
  │    when money is involved.                       │
  │                                                  │
  └──────────────────────────────────────────────────┘

   Edit before copying          Only the 5 you selected are included.
                                Nothing about how this was learned is shared.
```

| | |
|---|---|
| Type | `ui-monospace, SFMono-Regular, Menlo` 14px / 1.7 — reads as *a thing to paste* |
| Panel | `--surface` on `--bg`, 1px hairline, radius 16, 24px padding |
| Scroll | max-height 420px, internal scroll for `detailed` and `structured` |
| Appearance | slides in below the sticky bar; page scrolls to it |
| Copy button | `[ Copy ]` → `✓ Copied` for 2s |
| Format switcher | regenerates **in place**, no re-click of Generate |
| Checkbox change after generating | panel stays, shows `Selection changed — [ Regenerate ]` |

**Edit before copying** turns the block into a plain textarea. Edits affect the clipboard only, never the stored profile — editing an export is not the same as correcting a belief.

---

## 2. ⚠️ Normalise the voice — the bigger quality problem

The current block is in three different voices:

| Line | Voice |
|---|---|
| "You'd want to be asked about anything over about $500" | describing the user |
| "confirm with me if they're sensitive information" | instructing the AI |
| "if it's non-reversible then asked me first" | the user's raw words, including the typo |

This block gets pasted into a system prompt, so **every line must be imperative, addressed to the AI.** Mixed voice is what makes it read as machine output rather than something a person wrote — and that block *is* the product.

### Two fields per item

```js
{
  id: 'spoken_0',
  raw:  "if it's non-reversible then asked me first",      // never edited — this is evidence
  text: "Ask me first before anything that can't be undone.", // normalised — this is exported
  move: 'ask',
  source: 'you told me'
}
```

- **`raw` is immutable.** It's what the user actually said, it's the provenance, and it's what the detail panel shows under "why I think this."
- **`text` is generated once at save time**, using the `/api/extract` or `/api/refine` call you're already making. Never at export time — Generate must stay pure string assembly with no model in the path, or the format switcher becomes slow and non-deterministic.

### Normalisation rules — put these in the prompt

```
Rewrite as a single instruction addressed to the AI, in the user's voice.
- Imperative: "Ask me before…", "Go ahead when…", "Tell me after…"
- Never "You'd want…" or "The user prefers…"
- Fix grammar and typos. Resolve dangling references.
- Under 14 words. One rule per line. End with a full stop.
- Never add a condition the user didn't state.
```

| Raw | Normalised |
|---|---|
| "You'd want to be asked about anything over about $500" | Ask me before spending more than $500. |
| "confirm with me if they're sensitive information" | Confirm with me before sharing anything sensitive. |
| "if it's non-reversible then asked me first" | Ask me first before anything that can't be undone. |

Use `text` in the policy checklist too — "Ask me before spending more than $500" reads better there as well, and one string means the list and the export can never disagree.

---

## 3. Bug — a "Go ahead" rule filed under "Ask me"

In the current screenshot, *"Go ahead when something can be undone, even when money is involved"* sits in the **Ask me** group.

**Cause:** interview-confirmed items inherit the `move` of the *claim* rather than deriving it from the *content*. The reversibility claim is phrased as a question about permission, so a Yes is being filed as `ask`.

**Fix:** set `move` from the confirmed statement, not the claim:

```js
const MOVE_FROM_TEXT = t =>
  /^(go ahead|you can|feel free)/i.test(t) ? 'act'
: /^(tell me|let me know|notify)/i.test(t) ? 'act'
: /^(show|draft|prepare)/i.test(t)         ? 'show'
: /^(ask|confirm|check)/i.test(t)          ? 'ask'
: /^(treat|apply|always)/i.test(t)         ? 'modifier'
: 'ask';   // safe default
```

Run it on `text` after normalisation — which is another reason to normalise first. Safe default is `ask`: a misfiled rule that asks too often is recoverable; one that acts too freely isn't.

---

## 4. Source labels

Four values, and they must be accurate:

| Label | When |
|---|---|
| `learned` | inferred from the quiz, unverified |
| `confirmed by you` | you said Yes in the interview |
| `you told me` | you typed or spoke it, **including a threshold you entered** |
| `from your history` | approved from an import |

The \$500 item currently says *"you corrected this"* — but the user typed the number during the interview, so it's **`you told me`**. Reserve `you corrected this` for a *Not quite* that narrowed an existing scope.

---

## 5. Three formats, same selection

**Short** — the bullet list above. Default.

**Detailed** — grouped with headers, two sentences each:

```
HOW TO WORK WITH ME

MONEY
Ask me before spending more than $500. Below that, go ahead.

REACHING OTHER PEOPLE
Confirm with me before sharing anything sensitive.

WHEN IT CAN'T BE UNDONE
Ask me first before anything that can't be undone. When something
can be undone, go ahead — even when money is involved.

KEEPING ME IN THE LOOP
Tell me afterwards when you act on your own.
```

**Structured** — the future API payload, JSON, shown now as copyable text.

All three assembled in code from the same `text` fields. No model at export time.

---

## 6. Empty selection

If every box is unchecked, disable Generate and show:

> Pick at least one policy to include.

Don't generate an empty block — a profile that says nothing is worse than no profile.
