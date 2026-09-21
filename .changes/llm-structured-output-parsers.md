packages: @genfeedai/helpers @genfeedai/workflows @genfeedai/contracts

Add `unwrapFencedJson` to `@genfeedai/helpers`. It strips a Markdown code fence
from a model's answer — three or more backticks or tildes, any info string,
surrounding prose — so a schema rather than a regex decides whether the payload
is usable. Only routes that cannot be handed a JSON Schema need it; anything
going through `LlmDispatcherService.completeStructured` is already enforced.

`@genfeedai/workflows/generation` replaces `parseWorkflowGenerationResponse`
with `parseUnenforcedWorkflowGeneration`. The old function coerced a bad answer
into a partial workflow; the new one unwraps a fence and validates against the
exported `workflowGenerationSchema`, throwing on anything that does not match.
Callers on an unenforced provider (the desktop app's user-configured model)
must handle that throw instead of receiving a half-built graph.

`@genfeedai/contracts/api-types` gains a zod schema per migrated LLM response
(content plans, quality and SEO scoring, task decomposition, insights, trends,
optimizations, schedules, template ranking, workflow generation). Each exports
its schema, its inferred type, and its schema name for the provider request.
