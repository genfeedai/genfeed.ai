packages: client, contracts, hooks, pages

Article models and interfaces now declare optional `organizationId: string` for
creation payloads. Missing active-organization context is omitted instead of sent
as null, matching the required string relation in persisted articles. Existing
structurally compatible brand, ingredient, article and storyboard models flow
through their service/hook contracts directly without interface-to-model casts.
