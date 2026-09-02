packages: @genfeedai/contracts/constants @genfeedai/contracts

Add explicit `posts:draft`, `posts:schedule`, `posts:approve`, and
`posts:publish` API-key capabilities. MCP presets remain approval-first and do
not grant direct publishing; `posts:create` remains accepted only as a
draft-capability compatibility alias.

Existing keys retain their stored scopes and must be reissued or updated before
using newly gated schedule, approval, or direct-publish operations.
