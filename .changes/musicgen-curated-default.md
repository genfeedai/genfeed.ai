packages: @genfeedai/contracts/constants

Curate `SELF_HOSTED_MODELS` with a priced, active, default MUSIC entry for
`MODEL_KEYS.REPLICATE_META_MUSICGEN` (Meta MusicGen). Previously this key had
no curated row, so it seeded `cost: 0, isActive: false, isPublic: false` and
the MUSIC category had no usable registry row for the router to select
(#4679). `endpoint` carries the pinned Replicate version hash — the bare
`meta/musicgen` slug resolves through `resolvePredictionTarget`'s `{ model }`
path, which Replicate's predictions API only serves for its verified
"official model" catalog, not every public slug; without the hash every
generation 404s.

No consumer action required — this only changes the seeded catalog data
(`SELF_HOSTED_MODELS`'s inferred array-literal type), not any exported
function signature or type shape.
