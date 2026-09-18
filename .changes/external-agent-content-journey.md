packages: actions cli helpers

External agents share one connection, brand-scope, and media-artifact surface.

`@genfeedai/actions` catalogs `connect_social_account`, `initiate_oauth_connect`,
and `get_connection_status` on MCP as well as Agent. Generation tools accept
optional `brandId` and `selectedContext`. Callers that listed tools from a
cached MCP session must refresh `tools/list`.

`@genfeedai/cli` adds `gf connect <platform>` and `executeAgentTool`. Image and
video generate commands accept `--context` as transient prompt prefix only.
Existing `gf gen` and `gf status` flags are unchanged.

`@genfeedai/helpers` exports generation-context, external-connection-request,
and media-artifact helpers. They shape connection state, task-context receipts,
and MCP image/file parts. No existing helper signatures changed.
