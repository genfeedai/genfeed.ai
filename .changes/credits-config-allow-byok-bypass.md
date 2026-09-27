packages: @genfeedai/contracts

`CreditsConfig` (used by the `@Credits` decorator) drops `disallowByokBypass`
and adds `allowByokBypass`, inverting the default: `CreditsGuard` now resolves
a BYOK provider and bypasses credits only when a route explicitly sets
`allowByokBypass: true` (#5294). A route without the flag always charges
credits normally, even when the organization has an active key for the
model's resolved provider — billing fails safe by default.

Only `avatar-video.controller.ts` and `batch-interpolation.controller.ts` set
the flag today, matching the two routes verified to thread the org's
resolved key into their provider dispatch.
