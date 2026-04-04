## Admin Voice Route Boundaries

`/admin/library/voices`

- Superadmin-only DB-backed voice catalog manager
- Imports provider voices into Mongo-backed `ingredients` + `metadata`
- Curates catalog flags such as `isActive`, `isDefaultSelectable`, and `isFeatured`

`/admin/darkroom/voices`

- Separate darkroom workflow for voice generation and TTS experimentation
- Not the shared catalog manager
- Must not be repurposed to manage the DB-backed catalog
