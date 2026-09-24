packages: @genfeedai/actions @genfeedai/contracts @genfeedai/serializers

Scoped skill library actions (`archive_skill`, `create_skill`, `export_skill`, `fork_skill`, `publish_skill`, `rollback_skill`) are MCP-only curated actions. `ResolveActiveSkillsContext` accepts `actorUserId` so generation can authorize the same caller. Skill responses may include owner, audience, version, and capability fields.
