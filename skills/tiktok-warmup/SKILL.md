---
name: tiktok-warmup
description: Guide a transparent TikTok 5–7 day warm-up with native-app engagement, profile and feed tuning, gradual first uploads, and evidence-aware assessment. Triggers on "tiktok warmup", "warm up tiktok account", "new tiktok account", "tiktok account warmup plan", "tiktok engagement plan", "warmup content tiktok".
license: MIT
metadata:
  author: genfeedai
  version: "2.0.0"
---

# TikTok Warm-up Skill

Help creators follow a conservative 5–7 day launch routine for a new or newly repurposed TikTok account. The routine is advisory: TikTok does not publish an official warm-up program or expose a hidden account “trust score.” Never promise reach, diagnose a “shadowban” from low views, or imply that Genfeed can read private watch, like, save, follow, comment, or For You feed history.

The canonical structured definition is `social-warmup.tiktok@1` in `packages/contracts/src/api-types/contracts/social-warmup-blueprint.contract.ts`. This skill is the long-form product guidance. Shared product code must consume the structured definition rather than parse this file.

## Evidence and observation boundaries

Every checklist result must retain one of these provenance labels:

| Provenance | What it means | TikTok examples |
|---|---|---|
| `user_confirmed` | The creator explicitly confirms an action that connected APIs do not expose | Native watch time, likes, saves, follows, comments, manual-phone use, FYP relevance |
| `platform_verified` | TikTok returned the field through a scope the creator granted | Profile fields, authorized profile statistics, public owned videos, creator posting capabilities, owned-post metrics |
| `genfeed_observed` | Genfeed recorded its own activity | Drafted, scheduled, published, processing, or failed Genfeed post activity |

Missing scope or unavailable data means **unavailable**, not failed. Genfeed activity is not proof of native-app consumption. User confirmation is not platform telemetry.

Last reviewed: **2026-08-11**

Evidence references:

- [TikTok API scopes](https://developers.tiktok.com/doc/tiktok-api-scopes?enter_method=left_navigation)
- [TikTok Get User Info](https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info/)
- [TikTok Display API](https://developers.tiktok.com/doc/display-api-overview)
- [TikTok Content Posting API](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post)
- [TikTok post status](https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status)

## Safety and integrity rules

- Never automate scrolling, views, likes, saves, follows, comments, or other engagement.
- Never claim a fixed action count, elapsed time, or metric guarantees distribution.
- Use TikTok’s native controls and follow its current policies.
- Prefer original, rights-cleared media and accurate captions. Do not claim duplicate media automatically causes permanent suppression.
- Treat thresholds as planning heuristics, never hidden platform rules.
- If a post is processing, private, under review, removed, or failed, report that observable state. Do not translate it into “shadowbanned.”

## Blueprint overview

| Phase | Days | Goal |
|---|---:|---|
| Native consumption and niche engagement | 1–3 | Manually learn the niche and make the For You feed more relevant |
| Profile and feed tuning | 4–5 | Complete the visible profile, refresh authorized signals, and prepare one useful first upload |
| Gradual first uploads | 6–7 | Publish one original item, continue normal engagement, review real outcomes, and optionally publish a second item |

Five days is the earliest graduation point. Seven days is the recommended full plan. Extending the plan is reasonable when the creator needs more time, a posting outcome is unresolved, or the content is not ready. Neither duration guarantees reach.

## Phase 1: Days 1–3 — Native consumption and niche engagement

Use TikTok manually on the creator’s phone. Keep sessions natural and manageable; the objective is to understand the audience and content conventions, not to hit a magic count.

### Daily checklist

- [ ] Search two or three niche topics and watch enough of each selected video to understand it.
- [ ] Note recurring hooks, formats, questions, sounds, and creator styles.
- [ ] Like or save only examples that are genuinely useful or representative.
- [ ] Follow a small set of active, relevant creators; avoid bulk follow/unfollow behavior.
- [ ] Leave contextual comments only when there is something specific to add.
- [ ] Check whether the For You feed is becoming more relevant and explicitly record the result.
- [ ] Confirm that all engagement was performed manually in the native app.

All seven checks are `user_confirmed`. A connected TikTok account cannot verify them through the standard scopes listed above.

### Niche search bank

When the user gives a niche, produce a compact bank:

| Search type | Purpose | Fitness example |
|---|---|---|
| Broad topic | Learn the main conversation | “beginner fitness” |
| Problem | Find audience questions | “gym anxiety tips” |
| Format | Learn native presentation | “beginner workout carousel” |
| Creator | Find relevant accounts | “fitness coach for beginners” |

### Creator selection guidance

Prefer accounts that are active, clearly relevant, and use formats the creator can realistically sustain. Follower count is context, not a quality guarantee. Do not infer fake followers from one ratio or exclude an account solely because it is large, small, personal, or corporate.

### Contextual comment patterns

Use these as structures, not copy-paste templates:

- **Specific observation:** “The example about [specific point] clarified [specific question].”
- **Genuine question:** “When you used [specific technique], how did you decide between it and [alternative]?”
- **Relevant experience:** “I tried [related action] and noticed [concise result].”
- **Useful addition:** “One related detail that helped me was [specific, accurate point].”

Avoid repetitive text, promotional replies, fabricated experiences, or comments that do not relate to the video.

## Phase 2: Days 4–5 — Profile and feed tuning

Continue the manual routine at a sustainable pace, then make the account understandable to a real visitor.

### Profile checklist

- [ ] Use a recognizable display name and avatar.
- [ ] Write a concise bio that accurately describes the account.
- [ ] Confirm that any profile link or business information is accurate and appropriate for the account.
- [ ] Review privacy, comment, Duet, Stitch, and disclosure settings in TikTok.

When authorized, Genfeed may label returned profile fields as `platform_verified`. Profile completeness is evaluated only from granted fields. It does not prove account quality or predict distribution.

### Authorized signal refresh

If the creator granted the corresponding scope, refresh:

- Basic/profile fields from `user.info.basic` and `user.info.profile`.
- Follower, following, likes, and video counts from `user.info.stats`.
- Owned public videos from `video.list`.
- Creator posting choices and restrictions available to the Content Posting API.

Each returned field is `platform_verified` and needs an observation timestamp. A missing scope or omitted field is unavailable. Do not convert an empty public-video list into a failed warm-up signal.

### Feed tuning

- [ ] Continue niche searches and ordinary viewing.
- [ ] Use TikTok’s native “not interested” or equivalent controls for clearly irrelevant recommendations when appropriate.
- [ ] Record FYP relevance as the creator’s observation, not a platform-verified metric.

### Prepare the first upload

Choose one small, useful, niche-relevant item the creator can execute well. Video, photo mode, or another format can work; do not claim one format is universally favored.

Use this brief:

```text
FIRST TIKTOK UPLOAD BRIEF
Topic: [one specific audience problem or observation]
Format: [video / photo mode / other supported format]
Viewer value: [what the viewer learns, feels, or can do]
Hook: [accurate opening, no unsupported promise]
Body: [three to five concise beats]
Caption: [clear description and necessary disclosure]
Rights check: [original or licensed visuals/audio]
Accessibility: [captions, readable text, useful alt context]
Policy check: [claims, disclosure, privacy, and community rules]
```

Good first-upload topics include a short tutorial, a specific lesson, a process demonstration, a myth corrected with reliable evidence, or a compact checklist. Avoid engagement bait and claims the creator cannot support.

## Phase 3: Days 6–7 — Gradual first uploads

### Day 6: Publish and observe one original upload

- Publish the prepared item through TikTok or an authorized Genfeed flow.
- Preserve the actual state: draft, scheduled, processing, public, private, failed, or removed.
- Continue ordinary niche viewing and genuine replies.
- Do not repeatedly delete and re-upload solely because early views are low.
- Give metrics enough time to settle for the account and audience before drawing conclusions.

TikTok public-video data or Content Posting status is `platform_verified` when available. Genfeed schedule, publish, and failure records are `genfeed_observed`. Native replies and consumption remain `user_confirmed`.

### Day 7: Review and optionally publish a second item

Review the first item before deciding whether to publish again:

- Is the post public or still in a documented processing/review state?
- Are there technical or policy errors to resolve?
- Which owned-post metrics are actually available?
- Are comments or questions revealing a useful follow-up?
- Can the creator maintain quality without forcing volume?

A second original upload is optional. Publish it only when it is ready and there is no unresolved technical or policy issue. Continue normal engagement whether or not a second item is published.

## Evidence-aware assessment

Assess observable outcomes; do not score a hidden algorithm state.

### Platform-verified when authorized

- Profile and statistics returned by granted user-info scopes.
- Public owned videos returned by `video.list`.
- Creator posting capabilities returned by the posting flow.
- Owned-post metrics that TikTok returns.
- Content Posting status, including processing, completed, or failed outcomes.

### Genfeed-observed

- Draft and schedule creation.
- Publish attempts.
- Provider acknowledgements and processing state.
- Failures and recorded failure reasons.

### User-confirmed

- Manual-phone use.
- Watch behavior, likes, saves, follows, and comments.
- FYP relevance.
- Native actions not returned through the authorized APIs.

### Interpreting a weak first result

Low or flat views alone do not prove a “shadowban.” Check, in order:

1. The observable post status and visibility.
2. Any moderation notice or policy message shown by TikTok.
3. Genfeed or provider failure details.
4. Scope availability and snapshot staleness.
5. Content clarity, rights, accessibility, audience fit, and technical quality.
6. Whether more time or another high-quality test is appropriate.

Report uncertainty directly. Never promise that completing the checklist will prevent moderation or guarantee distribution.

## Graduation rules

The account can move to a gradual publishing cadence when:

- The required Days 1–5 native actions are explicitly user-confirmed.
- Authorized profile, statistics, public-video, and creator-capability snapshots are refreshed when those scopes are available.
- A first original upload is observed through authorized platform data when available.
- Applicable Genfeed schedule, publish, and failure activity has been reviewed.
- No known technical, policy, or rights issue remains unresolved.

Graduation is a workflow milestone, not a platform guarantee. Increase cadence according to the creator’s ability to sustain quality and respond to real results. Do not prescribe fixed promotional ratios or universal post counts as algorithm rules.

## Genfeed integration

### Drafting

Use Genfeed to research, outline, or draft the first upload. Keep the draft unpublished until the creator approves the topic, assets, claims, disclosures, caption, and TikTok settings.

### Publishing

Before an authorized publish action:

- Query current creator information and respect the returned privacy/settings choices.
- Obtain the creator’s explicit consent for the post.
- Use rights-cleared media and accurate disclosures.
- Record the Genfeed action as `genfeed_observed`.
- Poll or receive the TikTok status and store that result separately as `platform_verified`.

### Failures

Preserve the provider failure state and reason. Give the creator a concrete corrective action when one is known. Do not relabel a technical failure, review state, private post, or low metric as suppression.

## Output format

```text
TIKTOK 5–7 DAY WARM-UP
Blueprint: social-warmup.tiktok@1
Last reviewed: 2026-08-11

CURRENT PHASE: [Days 1–3 / Days 4–5 / Days 6–7]

TODAY
- [action]
  Completion: [attestation / signal / event]
  Provenance: [user_confirmed / platform_verified / genfeed_observed]
  Status: [incomplete / complete / unavailable / stale / failed]

AVAILABLE EVIDENCE
- [signal and observation time]

UNAVAILABLE EVIDENCE
- [missing scope or unavailable field; never reported as false]

NEXT ACTION
- [one concrete step]

CAUTION
- This routine does not guarantee reach or diagnose hidden ranking states.
```
