---
name: composer docked cards
description: Composer-top cards sit flush on the prompt bar at full width — no transcript gap, no header sliver
type: feedback
---

**Rule:** Generation, status, onboarding, and follow-up cards in `PromptBarContainer` `topContent` dock flush against the prompt bar (`gap-0`) at full width. Do not leave a vertical gap that lets the conversation show through. Do not auto-collapse the generation card into a header sliver.

**Why:** A floating card with `gap-2` / `pb-2` sits above the bar like a separate overlay. 90% width makes a stepped stub. Auto-collapse on generate hides the form and leaves a thin "Generate Image" bar.

**How to apply:**

1. Keep the dock in `PromptBarContainer` (`data-composer-top-stack`, `w-full`, `gap-0`).
2. Do not wrap composer-top cards in `pb-2` / `mb-2`.
3. Generation cards on the bar use a square bottom (`rounded-t-xl rounded-b-none`) so they touch the composer.
4. Keep the generate form open while a run is in flight. Manual collapse is fine; error/idle expand.
