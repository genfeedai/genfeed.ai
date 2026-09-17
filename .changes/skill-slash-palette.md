packages: agent, client, helpers, hooks, pages, props, services

Expose first-party and org skills in the shared `/` composer palette.

`@genfeedai/helpers` adds `resolveSkillSurfaces` and `extractRequestedSkillSlugs`.
`GET /skills?surface=` filters the catalog. Agent and Studio composers share one
slash-command extension in `@ui/prompt-editor`; a picked skill is a literal
`/slug` token sent as `requestedSkillSlugs`. `AgentSlashCommand` is removed from
`@genfeedai/agent` and replaced by `PromptCommand` in `@genfeedai/props`.
