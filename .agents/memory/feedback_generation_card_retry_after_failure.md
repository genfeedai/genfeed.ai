---
name: generation card retry after failure
description: After a failed generate, keep Generate on the card; composer UI action false is a failure, not Done
type: feedback
---

# Generation card keeps Generate after failure

A failed generate (provider 401, invalid model, etc.) must leave the
**Generate Image/Video** control on the card. Do not mark the card Done, do
not auto-collapse it, and do not leave the error only on the sticky composer
stack that covers the button. Manual collapse after failure is allowed.

`handleAgentUiAction` returns `false` and writes `setError(...)` instead of
throwing. The generation card must treat `outcome === false` as failure, copy
that error onto the card, set `status` to `error`, and clear the composer
error so Generate stays clickable. Do not also pin `AgentRunFailureCard`
in the conversation timeline while the generation card is docked — one
complete alert on the card is enough. The card uses `AgentRunFailureCard`
(title / summary / detail / recovery + full diagnostic copy), not the
flattened `AgentErrorMessage` plus a second Try Again.

**Why:** Composer generation goes through `confirm_generate_media`. Treating a
false UI-action result as success hid Generate after auth failures and showed
a Done label on an empty collapsed card.

**How to apply:** `showGenerate` stays true for `idle` and `error`. Never set
`status` to `done` unless the UI action returned success (not `false`) or the
direct generate path produced a result. Add a regression test that calls
`onUiAction` resolving `false` and asserts Generate is still in the document.
