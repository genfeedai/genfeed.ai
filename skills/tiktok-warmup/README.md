# TikTok Warm-up Skill

Evidence-aware TikTok 5–7 day guidance: native-app consumption and niche engagement on Days 1–3, profile and feed tuning on Days 4–5, then gradual first uploads and continued engagement on Days 6–7.

## Installation

```bash
npx skills add genfeedai/skills/tiktok-warmup
```

## Usage

```text
"Create a transparent TikTok warm-up plan for my fitness brand"
"Build my Days 1–3 TikTok native engagement checklist"
"Help me tune my TikTok profile and feed on Days 4–5"
"Prepare my first TikTok upload for Day 6"
"Assess my TikTok launch without guessing about shadowbans"
```

## What it does

- Guides a 5–7 day progression without promising distribution outcomes.
- Labels native watch, like, save, follow, comment, manual-phone, and FYP checks as `user_confirmed`.
- Distinguishes authorized TikTok profile, statistics, public-video, capability, and owned-post data as `platform_verified`.
- Distinguishes Genfeed schedule, publish, and failure activity as `genfeed_observed`.
- Produces a policy-aware first-upload brief and a gradual launch assessment.
- Explains missing scopes and unavailable data without converting them into failed checks.
- Avoids hidden trust-score claims and does not diagnose “shadowbans” from low views.

## Phases

| Phase | Days | Output |
|---|---:|---|
| Native consumption and niche engagement | 1–3 | Manual native-app checklist, niche search bank, feed-relevance check |
| Profile and feed tuning | 4–5 | Profile checklist, authorized signal refresh, first-upload brief |
| Gradual first uploads | 6–7 | First upload, outcome review, continued engagement, optional second upload |
| Graduation | 5–7+ | Evidence-aware next action with no reach guarantee |

The canonical machine-readable definition is `social-warmup.tiktok@1` in `@genfeedai/contracts/api-types`; `SKILL.md` remains the long-form guidance source.

## License

MIT
