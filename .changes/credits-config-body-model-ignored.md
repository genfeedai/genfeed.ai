packages: @genfeedai/contracts/interfaces @genfeedai/contracts

Add optional `CreditsConfig.isBodyModelIgnored`. When set, `CreditsGuard` prices
a route from its decorator `amount` / `modelKey` only, ignoring a request-body
`model` that names the content's target model rather than the billed one.
