packages: @genfeedai/pricing @genfeedai/contracts @genfeedai/contracts/constants @genfeedai/contracts/interfaces agent

Add one shared generation pricing contract (`calculateImageGenerationCredits`,
`calculateVideoGenerationCredits` and their primitives) to `@genfeedai/pricing`;
the API credits helpers that held them now only carry deferred-request plumbing.
Contracts gain the calculation input/result interfaces, the Agent generation
quote request/response shapes (now carrying `aspectRatio`), and the shared
aspect-ratio execution-dimension table the Agent tool, client and quote resolve
through. `@genfeedai/agent` re-exports the quote types from contracts.

Consumers importing the moved pricing primitives from
`@api/helpers/utils/credits/generation-credit-cost.util` import them from
`@genfeedai/pricing` instead.
