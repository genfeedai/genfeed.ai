packages: @genfeedai/helpers @genfeedai/contracts

Add `@genfeedai/helpers/integrations/mcp-resource.helper`, the single rule that
derives the OAuth protected-resource identifier (RFC 8707 `resource`) for the
Genfeed MCP server, plus the `McpResourceIdentifierResolution` interface in
`@genfeedai/contracts`.

The API authorization server and the MCP server both resolve the identifier
through `resolveMcpResourceIdentifier`, so the value advertised in
protected-resource metadata and the value enforced at the token endpoint can no
longer disagree. `deriveMcpResourceIdentifier` normalizes any spelling of the
configured URL (with `/mcp`, without it, with a trailing slash) to one
identifier and rejects a query string or fragment, which a resource identifier
may not carry. `buildProtectedResourceMetadataPaths` returns the bare and the
RFC 9728 path-suffixed well-known locations.

Consumers that previously appended `/mcp` themselves, or read the retired
`GENFEED_MCP_RESOURCE_URL`, must call the helper and read
`GENFEEDAI_MCP_PUBLIC_URL` instead. A configured URL the helper cannot resolve
now throws `McpResourceConfigurationError` naming the offending variable, which
fails service startup rather than a user's token exchange.
