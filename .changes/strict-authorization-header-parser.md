packages: @genfeedai/libs

Add `@genfeedai/libs/auth/authorization-header`, exporting
`parseAuthorizationHeader` and its `ParsedAuthorizationHeader` interface. It
strictly parses an `Authorization` header into exactly one scheme and one
token, rejecting a header with zero, one, or three-or-more
whitespace-separated fields instead of silently truncating it.

`CombinedAuthGuard`, `ApiKeyAuthGuard`, `AdminApiKeyGuard`, `InternalApiKeyGuard`,
the Better Auth passport strategy, the webhook shared-secret verifier, the MCP
server's bearer-token extraction, and the notifications/websocket gateways all
now parse `Authorization` headers through this one helper, so a malformed
header (e.g. `Bearer <token> extra` or `Foo <token>`) is rejected everywhere
instead of being accepted on some surfaces and rejected on others (#5206).
