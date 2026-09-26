packages: @genfeedai/agent @genfeedai/pages @genfeedai/props @genfeedai/ui @genfeedai/harness @genfeedai/serializers @genfeedai/services @genfeedai/contracts/interfaces

Knowledge moves into the shared Library reference picker (`ContentLibraryPicker`
now takes a `knowledgeSection` slot; the Agent `knowledgePicker` slot is renamed
`knowledgeSection`). `KnowledgeReferenceSection` replaces `KnowledgeContextPicker`
with an "Auto — use brand knowledge" default. `KnowledgeReceiptList` moves to
`@ui/knowledge/KnowledgeReceiptList`.

Studio image and video requests carry an optional `knowledge` selection
(`BaseGenerationPayload.knowledge`) through the new `ImageGenerationSerializer`
and `VideoGenerationSerializer`, which also stop dropping `harness` and
`requestedSkillSlugs`. `GenerationHarnessReceipt.knowledgeReceipts` records the
source versions folded in by `selectMediaKnowledgeSources` from
`@genfeedai/harness`.
