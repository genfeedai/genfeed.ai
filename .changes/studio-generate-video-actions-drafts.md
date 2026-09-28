packages: @genfeedai/client, @genfeedai/models, @genfeedai/pages, @genfeedai/props, @genfeedai/serializers, @genfeedai/services

Studio Generate saves its composer as a server-side draft per user and brand
(`StudioGenerateDraft` model, serializer and `StudioGenerateDraftsService`).
Masonry video props and Studio quick actions accept opt-in `onOpenInEditor`
and `onResize` handlers, Studio Generate jobs carry `parentId`, and
`StudioGenerateReferenceRole` now lives in contracts instead of props.
