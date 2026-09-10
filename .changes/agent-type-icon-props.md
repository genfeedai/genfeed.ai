packages: @genfeedai/props

Add `AgentTypeIcon` for agent marketplace and hub icon rendering.

- `props`: new `./automation/agent-type-display.props` export.

Existing agent-type display consumers keep compiling; the type is a
`ComponentType<{ className?: string }>` alias moved out of a route file.
