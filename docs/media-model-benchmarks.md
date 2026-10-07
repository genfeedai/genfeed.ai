# Image and video model selection

Last verified: **2026-10-07**. Rankings below are a dated snapshot, not live
configuration. The model registry remains the runtime source of truth.

## Selection policy

Use independent benchmarks to shortlist quality candidates, then qualify the
exact provider endpoint against representative product prompts. A leaderboard
position alone does not establish production quality, provider latency or
availability. Production Auto considers active, priced, reviewed `RECOMMENDED`
rows admitted by the organization's allowlist and required capabilities.

Hosted FLUX.1 endpoints (Schnell, dev, pro/1.1 and Kontext) are `LEGACY`.
Keep existing keys resolvable for explicit selection and stored workflows;
do not promote them because they are cheap or fast. FLUX.2/FLUX.3 and custom
trained models require their own evidence rather than inheriting a family score.

`NODE_ENV=production` uses current media defaults on cloud and self-hosted
deployments: Nano Banana 2 Lite for images and MiniMax H3 for video.
Development, tests, staging and an unset `NODE_ENV` retain inexpensive defaults
(Schnell and P-Video). That non-production catalog explicitly promotes Schnell
to `RECOMMENDED`; its production row remains legacy. Existing operator settings
are preserved by the seed, so an explicitly configured legacy default remains
an explicit choice. Switching defaults can increase provider spend on new
self-hosted production installs.

## Evidence snapshot

Scores are comparable only within the same board, version and task. “Samples”
is the board's reported sample count. Intervals below are reported 95% intervals.

### Text to image

Source: [Artificial Analysis AA-Image-T2I v2.0](https://artificialanalysis.ai/image/leaderboard/text-to-image),
overall, available models, read 2026-10-07.

| Exact benchmark model/settings | Rank | Elo (95% interval) | Samples |
| --- | --- | --- | --- |
| GPT Image 2.5 Sunburst (max) | 1 | 1198 (1189–1207) | 14,432 |
| GPT Image 2.5 Flare (max) | 2 | 1191 (1182–1200) | 13,808 |
| Nano Banana 2 (Gemini 3.1 Flash Image) | 6 | 1126 (1119–1133) | 19,044 |
| Nano Banana 2 Lite (Gemini 3.1 Flash Lite Image) | 13 | 1095 (1087–1103) | 17,590 |
| FLUX.1 [dev] | 130 | 841 (834–848) | 9,781 |
| FLUX.1 [schnell] | 141 | 802 (795–809) | 11,521 |

This supports shortlisting Sunburst for quality and keeping Schnell out of
production Auto. Sunburst and Flare's intervals overlap; the numerical order
does not establish a decisive difference. Nano Banana **2.1** is a separate
catalog endpoint and does not inherit Nano Banana **2**'s result.

[Black Forest Labs' Schnell model card](https://huggingface.co/black-forest-labs/FLUX.1-schnell)
documents distillation for 1–4 inference steps and Apache 2.0 licensing. These
make it useful for inexpensive development smoke checks, not a quality default.

### Image editing

Source: [Artificial Analysis AA-Image-Editing v2.0](https://artificialanalysis.ai/image/leaderboard/editing),
overall, available models, read 2026-10-07.

| Exact benchmark model/settings | Rank | Elo (95% interval) | Samples |
| --- | --- | --- | --- |
| GPT Image 2.5 Sunburst (max) | 1 | 1183 (1175–1191) | 18,413 |
| GPT Image 2.5 Flare (max) | 2 | 1163 (1156–1170) | 19,216 |
| Ideogram 4.5 (High) | 23 | 1064 (1054–1074) | 2,796 |

Ideogram 4.5 remains the curated `IMAGE_EDIT` category default, not the benchmark
leader. Its seeded description uses medium quality, which is not the tested
High variant. Sunburst is currently cataloged under `IMAGE`, so an editing
leaderboard result alone cannot make it an `IMAGE_EDIT` Auto candidate. Before
changing that route, qualify category dispatch, references, mask behavior,
dimensions and pricing at the exact quality setting.

### Text to video with audio

Source: [Artificial Analysis AA-Video-T2V v2.0](https://artificialanalysis.ai/video/leaderboard/text-to-video),
overall, with audio, base models, read 2026-10-07.

| Exact benchmark model/settings | Rank | Elo (95% interval) | Samples |
| --- | --- | --- | --- |
| Wan 3.0 | 1 | 1156 (1147–1165) | 8,300 |
| Dreamina Seedance 2.5 | 3 | 1143 (1134–1152) | 8,264 |
| MiniMax H3 (768p) | 4 | 1137 (1128–1146) | 8,315 |
| MiniMax H3 Max | 5 | 1130 (1120–1140) | 5,719 |

Seedance 2.5 is a high-ranked candidate among the curated recommended rows,
not the overall leaderboard winner. Its interval overlaps H3's. These results
do not establish a winner for silent video or other resolutions/durations.

### Image to video

Source: [Artificial Analysis AA-Video-I2V v1.0](https://artificialanalysis.ai/video/leaderboard/image-to-video),
overall, read 2026-10-07.

| Exact benchmark model/settings | Rank | Elo (95% interval) | Samples |
| --- | --- | --- | --- |
| MiniMax H3 Max | 1 | 1195 (1186–1204) | 5,894 |
| MiniMax H3 | 2 | 1181 (1173–1189) | 7,284 |
| Gemini Omni Flash | 3 | 1178 (1171–1185) | 12,327 |

The I2V ordering differs from T2V. Do not generalize a single `VIDEO` quality
tier to every input mode. Gemini Omni Flash here also differs from the T2V
board's Gemini Omni Flash **1.1**.

## Qualification and refresh

For each proposed recommendation, record the exact model version and provider
key, benchmark URL/version/task/category, retrieval date, tested settings,
score, interval, sample count, and any unresolved endpoint mapping. Missing
coverage means **unverified**, not zero quality. Refresh evidence before changing
recommendations, on a new release or benchmark revision, and after 30 days.

Use [Arena's image boards](https://arena.ai/leaderboard/text-to-image) as a second
independent preference signal where the exact variant is present. Do not average
Elo across boards. [VBench](https://arxiv.org/abs/2311.17982) diagnoses motion,
temporal consistency and other dimensions; [VBench 2.0](https://arxiv.org/abs/2503.21755)
adds faithfulness dimensions such as physics and controllability. Automated
metrics complement human evaluation rather than replacing it.

Before production promotion, compare at least two eligible candidates with a
fixed, versioned set of product prompts and blinded review of multiple outputs.
Cover image text/layout, product and character identity, reference edits and
aspect ratios; cover video motion, temporal consistency, first/last frames,
audio synchronization and duration. Record rejection rate, failures, p50/p95
end-to-end provider latency and **cost per accepted output**, including retries.
Retain prompt/settings and output references so the comparison is reproducible.
No paid generations were run for this documentation snapshot.

The catalog's quality and speed tiers are coarse curation metadata. Public
quality boards do not measure our provider's latency; speed tiers without a
provider measurement remain provisional. `isDefault` means a curated balanced
choice, not a benchmark title. Numeric cost and speed are optimized only after
quality eligibility, price approval and capability constraints are satisfied.

[Artificial Analysis' data API](https://artificialanalysis.ai/data-api/docs)
offers media results for future evidence collection, subject to its access
terms. A fetched score is evidence for review, never authorization to change
production routing automatically.

## Deployment verification

The seed propagates lifecycle, quality and speed metadata on application boot.
Verify the deployed revision and registry after rollout: production Schnell
must be `LEGACY`, and a non-production cheap-default catalog must promote it
to `RECOMMENDED`. Check all Auto priorities with a real organization's enabled
models and inspect the selected key. Repository tests prove policy behavior;
they do not prove production reconciliation or generated-media quality.
