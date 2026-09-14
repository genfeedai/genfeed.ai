packages: client, contracts, hooks, pages

Article models and interfaces now declare optional `organizationId: string` for
creation payloads. When present, the scalar is a string, matching the persisted
article relation. The creation hook forwards the existing string from `useBrand`
without changing runtime behavior. Structurally compatible brand, ingredient,
article and storyboard models flow through their service/hook contracts directly
without interface-to-model casts.
