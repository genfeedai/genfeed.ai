packages: @genfeedai/agent @genfeedai/props @genfeedai/services

Organization memory governance: list, archive, promote, and reject helpers
on `@genfeedai/agent` and `@genfeedai/services`, plus `OrgMemoryEntry` props
for the settings Memory page.

Consumers that already talk to `/agent/memories` can keep doing so. New
admin paths are `/agent/memories/organization`, `/:id/archive`,
`/:id/promote`, and `/:id/reject`.
