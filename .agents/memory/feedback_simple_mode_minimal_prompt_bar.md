---
name: Simple mode minimal prompt bar
description: Advanced Mode off = prompt/voice/generate only; backend auto-selects generation options; conversation uses Cursor-style sticky turns
type: feedback
---

# Simple mode = minimal prompt bar; Cursor-style conversation chrome

User direction (2026-08-13, PR #2920): with personal Advanced Mode **off**, the
studio prompt bar shows only the prompt input, voice, and generate. Model,
quality, format, outputs, collapse, sliders, and copy/enhance/undo are
advanced-mode chrome. The form auto-enables `autoSelectModel` so the backend
infers model + parameters from the prompt ("the agent should select those
options by itself").

Composer inputs start at one line and grow to five
(`PROMPT_BAR_TEXTAREA_MAX_HEIGHT` in `packages/ui` prompt-bar helpers; agent
TipTap composer mirrors it), then scroll.

Busy/status text uses the single-element `animate-text-shimmer` utility
(`packages/styles/keyframes.css`) — no per-letter pulse spans, no dot loaders.
The agent timeline groups entries into turns and pins the user prompt with
`position: sticky` for the duration of its turn.

**Why:** The user wants a Cursor-like, low-chrome creation UX: type and create;
options are opt-in via Advanced Mode, not default clutter.

**How to apply:** When adding prompt-bar controls, gate anything non-essential
behind `isAdvancedMode` (`isMinimalBar` in `PromptBarEssentials`). Don't add
new always-visible buttons to the bar. Keep status animations on the shared
shimmer utility rather than inventing new loaders.
