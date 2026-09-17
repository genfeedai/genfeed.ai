packages: @genfeedai/contracts @genfeedai/agent

Add `AgentGenerationActionParams` as the `generation_action_card` payload
in `@genfeedai/contracts`, including the identity fields the Studio handoff
already sends (`useIdentity`, `avatarPhotoUrl`, `voiceId`). Agent's local
`AgentUiAction.generationParams` now uses that type instead of a second
inline copy (#4717).
