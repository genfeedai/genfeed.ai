packages: @genfeedai/contracts

Add `byokApiKeyOverride?: string` to `CreditsConfig` (packages/contracts/src/interfaces/core/credits.interface.ts).

`CreditsGuard` resolves the org's BYOK key exactly once (via
`ByokService.resolveApiKey`) when a route's `@Credits` opts in with
`allowByokBypass: true`, and stashes the decrypted key on
`request.creditsConfig.byokApiKeyOverride` alongside the existing
`isByokBypass` flag — so the credit decision and the key threaded into
provider dispatch (`ReplicateService.generateTextCompletionSync` /
`generateStructuredTextSync`) can never disagree about whose key paid
(#5375, following the #5307/#5294 single-resolution pattern).

Purely additive optional field. Existing `CreditsConfig` consumers keep
compiling unchanged.
