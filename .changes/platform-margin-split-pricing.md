packages: @genfeedai/pricing

Split the single margin-multiplier runtime into independent generation and
agent-chat knobs (issue #5172).

- `DEFAULT_MARGIN_MULTIPLIER` is renamed to `DEFAULT_GENERATION_MARGIN_MULTIPLIER`
  and its value changes from 1.7 to 3.33 — `applyMargin`'s formula dropped its
  hidden `/ 0.30` base (`cost × multiplier` instead of `(cost / 0.30) × multiplier`),
  so the new default bakes that factor in and generation prices are unchanged.
- `getRuntimeMarginMultiplier` / `setRuntimeMarginMultiplier` / `applyMargin`
  keep their names and remain generation-scoped.
- New: `getRuntimeAgentChatMarginMultiplier` / `setRuntimeAgentChatMarginMultiplier`
  / `DEFAULT_AGENT_CHAT_MARGIN_MULTIPLIER` (`./agent-chat-margin`) — agent chat's
  own runtime multiplier, independent of generation's for the first time.
- New: `./margin-conversions` — `multiplierToMarkupPercent`,
  `multiplierToMarginPercent`, `multiplierFromMarkupPercent`,
  `multiplierFromMarginPercent`, and mode-aware `multiplierToPercent` /
  `percentToMultiplier` wrappers, plus `sellPriceForOneDollar`.
- `normalizeMarginMultiplier` now takes an explicit `fallback` parameter and is
  exported for reuse by the new modules.
- Removed `markupPercentFromMultiplier` (superseded by `multiplierToMarkupPercent`
  in `./margin-conversions`).

Consumers of the operator margin knob must read `PlatformSetting.marginMultiplierGeneration`
and `.marginMultiplierAgentChat` (both replace the removed single `marginMultiplier`
column) and hydrate both runtimes independently.
