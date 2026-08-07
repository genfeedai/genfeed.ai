---
name: project_agent_t3_density
description: T3/Codex density contract for the agent conversation surface (#2502)
type: project
last_verified: 2026-08-07
---

# Agent conversation surface — T3/Codex density

**Target state (issue #2502):** `/agent/*` presents a **single primary conversation column** with **composer-owned status** and **minimal timeline chrome**.

## Layout contract

- **Width owner:** `AGENT_CONVERSATION_TRACK_CLASS` in
  `packages/agent/src/constants/conversation-layout.constant.ts`
  (`max-w-3xl` + `min-w-0` + matching `px-3 sm:px-4`).
- Transcript body, alerts, skeleton, and workspace composer portal slot must
  share that track so edges align. Do not reintroduce a second `max-w-*` on the
  portaled prompt bar.
- Horizontal overflow is fixed with **min-w-0 flex chains** and
  **wrap/break on code tokens** (`SafeMarkdown`), not only `overflow-x-auto` on
  the outer shell.

## Chrome rules

1. **Generic Done** (`completion_summary_card`) is hidden when any **product
   result card** is present on the turn unless Done carries real outcome signal
   (media variants, secondary CTAs, outcome bullets, or non-generic summary).
   See `shouldRenderCompletionSummary` /
   `PRODUCT_RESULT_CARD_TYPES`.
2. **Done UI** defaults to an **inline status row**; expands only for rich body
   (`AgentCompletionSummaryCard`).
3. **Assistant copy/retry footer** is suppressed when a product result card or
   generated-text card already owns the turn.
4. **Thinking placeholders** in the timeline stay off when the docked composer
   status stack owns busy chrome (`suppressThinkingPlaceholder`).
5. **Brand/product agent routes** keep `showThreadSidebar={false}`. Standalone
   non-onboarding `AgentFullPage` does **not** paint a permanent dual-column
   setup/outputs rail (mobile drawers + ConversationInspector portal remain).

## Do not re-inflate

- Nested card stacks for pure status / generic Done.
- Full-bleed transcript width (`max-w-4xl` or wider) without an explicit product
  decision.
- Dual context panels (inline rail + inspector) on the same route.

## Residual limits (not pure T3 desktop)

- Onboarding still uses dual-column setup/outputs chrome when standalone.
- Product result cards keep intentional card surfaces (batch, preview, publish).
- Workspace inspector rail is shell-owned on product routes (ADR v3.2) — it is
  not the conversation column, but it can sit beside the canvas.
