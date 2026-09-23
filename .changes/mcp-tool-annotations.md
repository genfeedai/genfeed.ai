packages: @genfeedai/actions

Emit MCP tool annotations on every MCP-surfaced tool (#4977).
`CanonicalToolDefinition` now carries `title` and `annotations`
(`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`).
`ToolAnnotations` is a public type. `toMcpTools` copies `title` and
`annotations` onto each MCP tool.

Defaults are derived in `registry/source/tool-annotations`
(`deriveMcpToolPresentation`, `toolTitleFromName`) and stamped at registry
load. An MCP-surfaced tool missing `title` or `readOnlyHint` throws when the
registry loads. Catalog authors can override a derived hint by setting
`annotations` on the definition; otherwise the derivation stands.
