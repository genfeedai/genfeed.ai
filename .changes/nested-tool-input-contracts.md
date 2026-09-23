packages: @genfeedai/actions

Declare supported nested inputs for batch generation, workflows, dashboards,
brand voice, memory, scheduler settings, asset requests, and conversation
transfers. Tool parameter schemas now expose shared `$defs`; Agent and MCP
adapters retain those definitions so recursive JSON maps and dashboard blocks
validate consistently with action execution.

Consumers that reconstruct a tool schema must preserve its root `$defs` along
with `properties`, `required`, and `type`. Approval tokens are declared where
handlers verify them against trusted execution context; this does not authorize
model-generated confirmations. Unknown fields on fixed-shape objects remain
invalid. No data migration is required.
