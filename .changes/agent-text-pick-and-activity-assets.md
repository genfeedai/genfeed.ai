packages: agent contracts pages props ui

Add `text` to the agent composer's generation pick and let a prompt be saved as
a preset. Contracts add `GenerationSetupType` (`StudioGenerateType | 'text'`)
for the setup shared by Studio and the agent; `GenerationSetupValues.type` and
the recommendation input use it, while `StudioGenerateType` stays Studio's asset
registry. `AgentGenerationType` now accepts `'text'` alongside `'image'` and
`'video'`, with its own capability profile (brand enrichment, no aspect ratio,
duration, identity, look, model selection, outputs, references or speech).
`isAgentOwnedGenerationType` reports whether the agent, rather than the user or
a preset, chose the type. The chat input toolbar takes `onSavePreset`, and
`useAgentChatInput` exposes `fillPrompt`. Shared props add a modal `size` and
the preset-save handler on the generation-setup props.

Workspace activity now shows the generated asset. `activities-list.utils` adds
`getActivityAssetId` and `getActivityMediaPreviewUrl`, which resolve a preview
from a populated ingredient, an explicit media URL, or a CDN path derived from
the ingredient id, and `ActivityThumbnailCell` renders that preview instead of a
placeholder. The activity page itself passes the brand scope.

Setup popover `typeOptions` and `onTypeChange` now carry `GenerationSetupType`;
a Studio host should narrow with `isStudioGenerateType` before treating the value
as a Studio type. Consumers embedding the agent composer should handle `'text'` as a generation
type — a host that switches exhaustively on image/video will not compile until
it does — and pass `onSavePreset` to keep preset saving available. Hosts
rendering activity thumbnails should pass `getPreviewUrl` so populated
ingredients win over the derived CDN path.
