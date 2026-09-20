packages: contexts harness models props services

Expert Path (#4534) additions. All of them are additive; existing consumers
keep compiling without changes.

`@genfeedai/harness` — `ContentHarnessInput` accepts `harnessProfileId`, and
`ContentHarnessReceipts` carries an optional `harnessProfileId` alongside the
existing `brandOs` arm, so a composed brief records which brand harness
profile shaped it.

`@genfeedai/contexts` — new `getBrandOrganizationAccountType(brand)` helper,
reading `organization.accountType` from a brand payload (the auth bootstrap
brand list now selects it) so onboarding can route the `EXPERT` account type.

`@genfeedai/models` — `HarnessProfile` exposes the server-computed
`positioning` scorecard.

`@genfeedai/props` — new `onboarding/expert-path.props`; `settings/harness.props`
gains the positioning scorecard props and `settings/publishing-content.props`
gains `autoPublish.isApprovalRequired`.

`@genfeedai/services` — new `content/expert-path.service` (Expert Path status,
positioning regeneration, first content system and its per-item review);
`content/knowledge-sources.service` gains `upload()` and an optional
idempotency key on `capture()`; `social/brand-interview.service` gains
`completeInterview()`; `social/brands.service` accepts
`autoPublish.isApprovalRequired` in `updateAgentConfig`.
