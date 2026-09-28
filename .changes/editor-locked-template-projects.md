packages: @genfeedai/props, @genfeedai/serializers, @genfeedai/services

Editor projects generated from an approved composition template are
read-only in the Editor (#5462). The editor-project serializer derives
`isLocked` from `config.composition` (exported as
`computeEditorProjectIsLocked`), and `IEditorProject` carries it.
`EditorProjectsService` maps `isLocked` and adds `duplicate(id)` for
`POST /editor-projects/:id/duplicate`. The studio editor props gain an
optional `isReadOnly` on the toolbar, timeline, text, effects and properties
panels; `EditorLayoutProps` and `EditorState` gain the read-only, save
conflict and duplicate state; `EditorLockedBannerProps` is new.
