packages: @genfeedai/contracts

Classify brand voice generation failures with a public code (#4734).

- Add `BrandVoiceFailureCode`, `IBrandVoiceFailureMeta`,
  `IBrandVoiceFailureError`, `IBrandVoiceFailureDiagnostics` and
  `IBrandVoiceFailureView` in `./interfaces`
  (`interfaces/organization/brand-voice-failure.interface`).
- Remove `BrandProfileGenerationFailureReason` and
  `IBrandProfileGenerationDiagnostics`, added in #4814 and never read outside
  the brands API. `BrandVoiceFailureCode` replaces both with values that ship
  verbatim as the JSON:API error `code`, so the four parser reasons become
  `empty_output`, `malformed_output`, `unexpected_output_shape` and
  `incomplete_profile`, alongside the three input causes the endpoint also
  rejects.

A consumer that branched on the old server-only enum should read the response
`code` instead: `POST /v1/brands/:id/agent-config/generate-voice` now returns
it, with `meta.isRetryable`, in the error member itself.
