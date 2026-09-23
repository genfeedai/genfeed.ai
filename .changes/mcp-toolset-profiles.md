packages: @genfeedai/actions

Named MCP toolset profiles are public API: `MCP_PROFILE_NAMES`,
`McpToolsetProfileName`, `BARE_URL_MCP_PROFILE`, `BARE_MCP_URL_TOOL_CAP`,
`DEFAULT_MCP_PROFILE_TOOLSETS`, `DIRECTORY_MCP_PROFILE_TOOLSETS`,
`DIRECTORY_EXCLUDED_TOOLSETS`, `isMcpToolsetProfileName`, and
`resolveMcpProfile` (return type `McpProfileResolution`). `default` is core, scheduler, and content (the largest
prefix of the intended set that stays within the 30-tool bare-URL cap).
`directory` is that set minus generation, clips, and the `ui` widget toolset.
`full` (`resolveMcpProfile` kind `all`) is the unfiltered catalog.

`parseToolsetSelection` now returns `empty` alongside `toolsets` and
`unknown`. A declared toolset with zero tools on the requested surface stays
in `toolsets` and is listed in `empty`. Only a name that is not a declared
toolset is `unknown`. Callers that compared the whole selection object must
accept `empty`.
