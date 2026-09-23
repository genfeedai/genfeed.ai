packages: @genfeedai/actions

`CuratedActionName` now includes `request_media_upload`, `complete_media_upload`,
and `get_post` on the `content` toolset (agent and MCP). `get_post` stays read-only. Upload reservation and completion are direct writes
with `destructiveHint: false`; reserving creates a pending asset and requires
a selected brand.

`BARE_MCP_URL_TOOL_CAP` is 31 so the bare URL (core, scheduler, and content)
still advertises those tools. Callers that assumed the cap was 30 must accept 31.
