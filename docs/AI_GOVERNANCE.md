# AI governance — Scribble

**Version:** 0.1.0
**Applies to:** the Organise feature and the Dictate feature

This document records what Scribble does that could reasonably be called "AI", how it is governed, and what would have to change before anything more capable is added.

It does **not** claim compliance with the EU AI Act, the UK's AI principles or any other framework. It describes the controls that are in place and the assessments that would still be needed.

---

## 1. Position

> The prototype does not need artificial intelligence. Organisation begins with deterministic rules and, if it ever proves useful, on-device models. Any cloud capability would be a separate, explicitly governed feature, never a hidden dependency.

Two consequences of that position are visible in the code:

1. There is no model, no inference library and no AI service dependency anywhere in the project.
2. Both features that *could* have used AI are placed behind TypeScript interfaces, so a future implementation is a deliberate, reviewable substitution rather than an incremental drift.

---

## 2. Organise

### What it actually is

`localRulesOrganiser` in `src/services/organiser/localRules.ts` is a set of regular expressions and a word-overlap comparison. That is the whole of it.

| Property | Value |
|---|---|
| Model | None |
| Training data | None |
| Network access | None |
| Determinism | Total. The same notes always produce the same suggestions, and a unit test asserts this. |
| Explainability | Complete. Every suggestion carries the exact quoted phrase that triggered it. |
| Autonomy | None. It cannot change anything. |

### Groups it proposes

Actions, decisions, reminders, questions, people, dates, links, and related notes. A group is only proposed when at least two notes fall into it, so it never produces a "group" of one.

### Governance controls

| Control | Implementation |
|---|---|
| **Human approval before any change** | Suggestions are display-only. Nothing happens until the user clicks "Add a summary note" or "Gather these on the pad". |
| **Originals never overwritten** | The only two actions available are creating a *new* note and changing the *position* of existing notes. No code path rewrites the content of an existing note. |
| **Transparency at the point of use** | The panel states, every time it opens, that the analysis is deterministic, local, uses no AI model, and that nothing leaves the device. |
| **Evidence for every claim** | Each member of each suggestion shows the quoted text that matched, so a user can immediately judge whether the rule was right. |
| **Reversibility** | A summary note can be deleted like any other note. A "gather" is a set of position changes that can be moved back or undone by hand. |
| **Scope control** | If notes are selected, only those are examined. Otherwise the current pad is examined. Other pads are never read. |
| **No profiling** | No user model is built, nothing is stored about the user's behaviour, and results are not carried between sessions. |

### Known limitations of the rules

Stated plainly, because a user should be able to calibrate their trust:

- English only, and British English phrasing at that.
- The "people" rule looks for two consecutive capitalised words. It will find "Sarah Whitfield". It will also find "Project Falcon", and it will miss a single first name.
- The "questions" rule relies on a question mark.
- The "related" rule is a crude shared-word count. It will connect notes that merely share vocabulary.
- Notes with very little text produce nothing.

The interface reflects this by presenting output as *suggestions to review*, never as conclusions.

---

## 3. Dictate

### Position

Speech recognition is the one place where an obvious implementation would quietly send a user's voice to a remote service. Scribble refuses to do that.

`DictationEngine` separates two questions:

1. Is a speech-recognition engine present at all?
2. Can Scribble **confirm** that it processes audio on this device only?

Dictation stays disabled unless the answer to the second question is yes, or the user explicitly overrides it having read a plain statement of the risk.

### What ships in this prototype

The only engine present is the browser's `SpeechRecognition` API. It is reported as `processing: 'external'`, because in Chromium-based engines it normally streams audio to a remote service and there is no reliable way to prove otherwise.

Consequently:

- Dictation is **off by default**.
- Settings shows a warning explaining that Scribble cannot confirm local processing.
- Pressing Dictate while it is disabled explains why and offers to open Settings, rather than silently doing nothing.

### Controls that apply whenever dictation runs

| Control | Implementation |
|---|---|
| No background recording | A session starts only from an explicit user action |
| Explicit stop | The same button stops it; there is no timed or automatic capture |
| Visible indicator | A recording panel with a dot, the word "Recording", and a statement of where processing happens, is displayed for the whole session |
| No audio retained | Scribble never buffers or writes audio. Only the returned transcript is used |
| Honest labelling | The indicator states "Processed on this device" or "May use an external service" based on the detected capability, never optimistically |

### Current limitation, stated

**Fully offline dictation is not implemented.** The interface, the capability detection and the service abstraction are complete and working; the local engine behind them is not. Adding one means implementing `DictationEngine` with `processing: 'local'` and having it detected. Nothing in the interface would need to change.

---

## 4. If AI is added later

Any future capability that is more than deterministic rules must satisfy all of the following before it is merged:

1. **Declared.** It appears in this document with its purpose, its inputs, its outputs and its failure modes.
2. **Labelled in the interface.** Wherever it appears, the user is told an AI capability is being used, and where the processing happens.
3. **Opt-in.** Off by default. Enabling it requires an explicit choice with an accurate description of the data involved.
4. **On-device by preference.** A cloud capability must be a separate, separately-enabled feature, never a silent upgrade of an existing one.
5. **Non-destructive.** It may propose. It may not overwrite, delete or send anything.
6. **Reviewable.** Every output is presented for approval before it takes effect.
7. **Explainable to the degree the technique allows.** If evidence cannot be shown, that must be said in the interface.
8. **Re-assessed for risk.** `docs/THREAT_MODEL.md` T10 and `docs/PRIVACY.md` must both be revisited.
9. **Tested for determinism or documented as non-deterministic.** Users must know which they are dealing with.
10. **No training on user content.** Under no circumstances is a user's note content used to train or fine-tune anything.

---

## 5. Assessments still required

These have not been done and should not be assumed.

- **EU AI Act classification.** The current rules-based organiser is very unlikely to be an "AI system" under the Act, but the classification has not been formally assessed and would need to be redone for any future model.
- **Bias and fairness review.** The "people" rule keys on capitalised word pairs, which suits Western name conventions better than others. This has not been evaluated.
- **Accessibility of AI output.** Suggestions are announced to screen readers, but the review flow has not been tested with assistive technology users.
- **Human-oversight evidence.** The design requires approval for every change; there is no audit record proving that approval happened, which an organisation may require.
