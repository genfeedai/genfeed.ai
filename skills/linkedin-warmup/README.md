# LinkedIn Warmup Skill

Evidence-aware LinkedIn account warmup: profile completion, comment-first engagement, a first value-first story post, and a post-warmup assessment before promotional content.

## Installation

```bash
bunx skills add genfeedai/skills/linkedin-warmup
```

## Usage

```text
"Create a LinkedIn warmup plan for my new B2B account"
"Build my Days 1-3 LinkedIn profile completion checklist"
"Write comment-first engagement guidance for my niche on LinkedIn"
"Draft my first LinkedIn warmup story post brief"
"Assess my LinkedIn warmup — can I start posting promotional content?"
```

## What It Does

- Generates a 14-day warmup plan across profile completion, light engagement, a first story post, and assessment
- Prioritizes comment-first engagement and profile completeness for the Social Selling Index (SSI) pillars
- Labels feed consumption, connections, comments, reactions, and SSI as `user_confirmed`
- Distinguishes authorized profile, organization-page, and owned-post data as `platform_verified`, keeping member and organization claims separate
- Distinguishes Genfeed schedule, publish, and failure activity as `genfeed_observed`
- Outputs a graduated transition to regular content without promising SSI, reach, or restriction avoidance

## Phases Covered

| Phase | Days | Output |
|-------|------|--------|
| Profile Completion and Consumption | 1-3 | Profile checklist, niche feed seeding |
| Light Engagement | 4-7 | Connection criteria, first comments, daily checklist |
| First Original Story Post | 8-10 | Value-first story post brief |
| Assessment and Graduated Scaling | 11-14 | Post-warmup assessment and next-step cadence |

The canonical machine-readable definition is `social-warmup.linkedin@1` in `@genfeedai/contracts/api-types`; `SKILL.md` remains the long-form guidance source.

## License

MIT
