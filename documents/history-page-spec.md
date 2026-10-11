# `/history` — change spec

Fixes the confusing dual input, the silent wait, and the dead-end empty state.

---

## 1. One input, one button

**Now:** a textarea with "Find patterns →" beside it, plus a separate unstyled `<input type=file>` with no submit of its own. Unclear which control does what — and most likely the cause of the empty result, since the button reads the textarea and never touches the file.

**Change to a single drop zone that accepts both:**

```
  ┌──────────────────────────────────────────────┐
  │                                              │
  │   Paste a conversation, or drop a file here  │
  │                                              │
  │              ChatGPT · Claude · .txt         │
  └──────────────────────────────────────────────┘

        [ Learn and update my profile → ]

   🔒 Read once, never stored. Only patterns you approve are kept.
```

- Click opens the file picker; paste fills it as text; drag-drop accepted. One element, three ways in.
- When a file is dropped, replace the placeholder with `📄 chat-export.txt · 48 messages` and a `✕` to clear.
- **Button disabled until there's content.** A live-looking button that does nothing reads as broken.
- Button label: **"Learn and update my profile"** — "Find patterns" is a research verb; this one says what happens to *them*.

---

## 2. Progress — narrate it

The call takes seconds. A frozen screen reads as a failure, so show the work.

| Stage | Copy | Trigger |
|---|---|---|
| 1 | ✓ Read 48 messages | immediate, on parse |
| 2 | ✓ Looking for moments you corrected or approved | +600ms |
| 3 | ◌ Working out what they mean | until the response lands |

```
         ( mascot, gently animating )

      Give me a second — I'm reading…

   ✓  Read 48 messages
   ✓  Looking for moments you corrected or approved
   ◌  Working out what they mean
```

**This is what the mascot is for.** A spinner wastes a character whose entire job is representing the learning state.

⚠️ **Don't promise an automatic update.** "I'll update your profile when I'm done" commits you to silently changing the profile, which breaks rule 2. Everything found is a *proposal*.

**If processing exceeds ~20s** (a real ChatGPT export will), switch to background:

> I'm reading through this. It'll take a minute — carry on and I'll flag it when I'm done.

Then a badge on the profile nav: `2 patterns to review`. Still an invitation, never a change.

---

## 3. Broaden what counts as a signal

**Most conversations contain no act/ask moments.** A normal chat is "explain X" → "here's X." The extractor will correctly return `[]` and the feature will look broken on the typical upload.

Add communication signals, which appear in ordinary conversations:

```
Read this AI conversation. Find evidence about how this person wants AI to
BEHAVE or COMMUNICATE — not what they talked about.

Behaviour signals:
- told the AI to go ahead, stop, or check first
- corrected, rewrote, or undid something the AI did
- approved the same kind of action repeatedly

Communication signals:
- asked for shorter, longer, simpler, or more detailed answers
- asked for sources, reasoning, or options
- corrected tone or format
- rephrased the same request because the answer missed

Return JSON:
{"findings":[{
  "signal":"<short slug>",
  "dimension":"cost|reversibility|exposure|notification|communication",
  "direction":"more_autonomy|less_autonomy|style",
  "quote":"their exact words, under 20 words",
  "strength":"weak|medium|strong"
}]}

Ignore subject matter entirely. One instance is "weak" — still report it.
Nothing at all? {"findings":[]}
```

**Report weak evidence.** A single instance surfaced as a low-confidence proposal is better than silence — the user can accept or ignore it, and your Add / Ignore / Ask me pattern already handles exactly this.

---

## 4. Results — in a card, not as body text

```
  ┌─────────────────────────────────────────────┐
  │  I found 3 patterns                         │
  │  Tell me which ones are right.              │
  └─────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────┐
  │  You prefer shorter answers          medium │
  │                                             │
  │  "can you make that shorter"                │
  │  — you, twice in this conversation          │
  │                                             │
  │  [ Add to profile ]   Ignore   Ask me       │
  └─────────────────────────────────────────────┘
```

Strength chip top-right: `weak` · `medium` · `strong`. **Never a percentage** — history evidence has no noise floor behind it, so a number would be false precision.

---

## 5. Empty state — teach, don't just report

**Now:** *"I didn't find a behavior pattern in that."* Plain body text at the bottom of the page, with no visual link to the action. Reads like page copy, not a result.

**Change to a card with guidance:**

```
  ┌─────────────────────────────────────────────┐
  │  Nothing I could learn from, this time      │
  │                                             │
  │  This looks like a question-and-answer       │
  │  conversation. I learn most from sessions   │
  │  where you corrected me, told me to go      │
  │  ahead, or stopped me doing something.      │
  │                                             │
  │  Try a conversation where you were working  │
  │  rather than asking.                        │
  │                                             │
  │  [ Try another ]   Take the test instead →  │
  └─────────────────────────------──────────────┘
```

A dead end becomes instructions, plus a route to the thing that does work.

---

## 6. States

```
idle → ready (content present) → reading → results | empty | error
```

| State | Button | Note |
|---|---|---|
| idle | disabled | placeholder visible |
| ready | enabled | file chip or text shown |
| reading | spinner + "Reading…" | progress list visible |
| results | hidden | proposal cards |
| empty | hidden | teaching card |
| error | "Try again" | *"Something went wrong reading that. Your conversation wasn't saved."* |

**Error copy must repeat the privacy promise** — a failure is exactly when someone wonders what happened to their data.

---

## 7. Don't change

The privacy line stays verbatim: *"Read once, never stored. Only patterns you approve are kept."* And keep actually honouring it — process in memory, persist findings only, never the raw text.
