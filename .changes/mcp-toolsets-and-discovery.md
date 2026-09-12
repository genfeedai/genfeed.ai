packages: @genfeedai/actions

Add explicit toolsets to the curated action catalog and expose them as public
API. Every `CuratedActionCatalogEntry` and `CanonicalToolDefinition` now carries
a required `toolset`; the names live in the new leaf `registry/toolset-names`
(`TOOLSET_NAMES`, `ToolsetName`, `TOOLSETS`, `CORE_TOOLSET_NAME`,
`isToolsetName`) and the surface-aware helpers in `registry/toolsets`
(`getToolsets`, `getToolsetNames`, `getToolsForToolsets`,
`parseToolsetSelection`). `toMcpTools` stamps `genfeed.ai/toolset` into every
tool's `_meta` (`MCP_TOOLSET_META_KEY`).

Three MCP-only discovery actions join the always-on `core` toolset:
`list_toolsets`, `search_tools` and `describe_tool`. They let a client that
connected with a narrow `?toolsets=` selection find and call any other action it
is allowed to use. `describe_` is now a read-only name prefix.

The `ALL_TOOLS` assembly moved to `registry/tool-assembly`; `tool-registry`
still re-exports it and adds load-time invariants that throw on a catalog entry
without a toolset, an empty toolset, or a `core` toolset above 12 MCP tools.
The catalog reporter script parses reflowed entries and reports toolset changes.

Consumers that build catalog entries must supply a `toolset`. Consumers that
list MCP tools should pass the caller's toolset selection through
`getToolsForToolsets` and keep calls unfiltered.
