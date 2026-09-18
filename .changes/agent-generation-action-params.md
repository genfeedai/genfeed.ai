packages: @genfeedai/contracts @genfeedai/agent @genfeedai/pages

Add `AgentGenerationActionParams` as the `generation_action_card` payload
in `@genfeedai/contracts`, including the identity fields the Studio handoff
already sends (`useIdentity`, `avatarPhotoUrl`, `voiceId`). Agent's local
`AgentUiAction.generationParams` now uses that type instead of a second
inline copy (#4717).

`@genfeedai/pages` applies those identity fields on consume:
`buildStudioSettingsPatchFromHandoff` copies `avatarPhotoUrl` and `voiceId`
into Studio settings, and `resolveHandoffIdentityNotice` warns when an
identity generation could not snapshot them so Studio does not look like
the operator chose the defaults. Existing consumers require no migration.
