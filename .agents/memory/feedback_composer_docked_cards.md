---
name: composer docked cards
description: Composer-top cards sit flush on the prompt bar at 90% width, Codex-style — no transcript gap
type: feedback
---

**Rule:** Generation, status, onboarding, and follow-up cards in `PromptBarContainer` `topContent` dock flush against the prompt bar (`gap-0`) at `w-[90%]`. Do not leave a vertical gap that lets the conversation show through.

**Why:** A floating card with `gap-2` / `pb-2` sits above the bar like a separate overlay. The transcript reads through that slit. Codex stacks the attached chrome on the composer itself.

**How to apply:**

1. Keep the dock in `PromptBarContainer` (`data-composer-top-stack`, `w-[90%]`, `gap-0`).
2. Do not wrap composer-top cards in `pb-2` / `mb-2`.
3. Generation cards on the bar use a square bottom (`rounded-t-xl rounded-b-none`) so they touch the composer.
