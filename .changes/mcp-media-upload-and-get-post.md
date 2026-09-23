packages: @genfeedai/actions

`CuratedActionName` now includes `request_media_upload`, `complete_media_upload`,
and `get_post` on the `content` toolset (agent and MCP). `request_media_upload`
and `get_post` stay read-only. `complete_media_upload` is a direct write with
`destructiveHint: false`.

`BARE_MCP_URL_TOOL_CAP` is 31 so the bare URL (core, scheduler, and content)
still advertises those tools. Callers that assumed the cap was 30 must accept 31.
