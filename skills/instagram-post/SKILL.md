---
name: instagram-post
description: Write an Instagram feed post; the caption (hook, body, CTA), the hashtag set, alt text and the image brief for a single-image post. Use for "write an Instagram caption", "hashtag strategy", "IG post for this photo". For carousels use instagram-carousel; for Reels use instagram-reel; for Stories use instagram-story.
license: MIT
metadata:
  author: genfeedai
  version: 1.0.0
---

# Instagram Post

Write an Instagram feed post for a single image or photo: caption, hashtags, alt text and the visual brief. Instagram is visual first; the copy enhances the image and never replaces it.

For multi-slide posts use [instagram-carousel](../instagram-carousel/SKILL.md). For video use [instagram-reel](../instagram-reel/SKILL.md). For ephemeral sequences use [instagram-story](../instagram-story/SKILL.md).

## Core principles

1. **Visual first, copy second.** Decide what the image says before writing a word.
2. **The fold matters.** Only the first ~125 characters show before "...more". The hook must land there.
3. **Save-worthy wins.** Instagram creators widely report saves and shares as the strongest signals; write things people return to (tips, frameworks, checklists). Instagram does not publish exact weights, so test on the account.

## Inputs

- The image (or a description of it) and what it shows.
- The point: a lesson, a story, a product, an announcement.
- Audience, voice and brand context. Real facts only; do not invent results.
- The action wanted: save, share, comment, DM, link in bio.

## Workflow

1. **Look at the visual** (or brief it, see below).
2. **Write the hook** in under 125 characters.
3. **Write the body** in short paragraphs with one pattern below.
4. **Write the CTA.**
5. **Build the hashtag set** and alt text.
6. **Check** against the list at the end.

## Caption structure

```
[HOOK: under 125 characters]

[BODY: 2-5 short paragraphs]

[CTA]

[HASHTAGS]
```

### Hook formulas (under 125 characters)

| Formula | Example |
|---------|---------|
| Bold claim | "This one habit changed my skin in 14 days." (only if true) |
| Question | "What if everything you knew about productivity was wrong?" |
| Curiosity gap | "I stopped doing this and gained 10K followers." (only if true) |
| Direct address | "If you're a small business owner, read this." |
| Controversial | "Meal prep is overrated. Here's what works better." |
| Number-driven | "3 tools that replaced my entire marketing team." |
| Story opener | "Last Tuesday, a stranger DM'd me something wild." |
| Command | "Stop ignoring your analytics. They're trying to tell you something." |

### Body patterns

| Pattern | Structure | Best for |
|---------|-----------|----------|
| Story plus lesson | Setting, conflict, resolution, lesson | Personal brands, coaches |
| Tip list | Hook, tip 1, tip 2, tip 3, CTA | Educators, how-to |
| Before and after | Before, what changed, after, how you can too | Transformations |
| Behind the scenes | What you see, what happened, the real lesson | Trust |
| Myth buster | Belief, why it's wrong, the truth, proof | Authority |

### CTAs

| Type | Template |
|------|----------|
| Comment | "Drop a [emoji] if you've experienced this." |
| Save | "Save this for next time you need it." |
| Share | "Tag someone who needs to hear this." |
| Question | "What's your go-to for [topic]?" |
| Choice | "A or B? Tell me below." |
| DM | "DM me 'GUIDE' and I'll send the framework." |
| Link | "Full breakdown at the link in bio." |

### Bad versus good

**Bad:** "Living my best life! So grateful for everything. Link in bio! #blessed #lifestyle #happy #love #instagood ..."

No hook, no value, hashtag spam, "link in bio" with no context.

**Good:** "I tracked every dollar I spent for 90 days. Here's what shocked me: ..." followed by specific findings, a clear takeaway and a real question. (Illustrative: use only the user's actual data.)

## Hashtags

Instagram's own guidance has moved toward fewer, relevant hashtags, and the right number changes. Do not default to 25 without checking the account's results. A safe default is 3 to 10 relevant tags, mixed across tiers.

| Tier | Post volume | Purpose |
|------|------------|---------|
| Broad | 1M+ | Category placement |
| Niche | 10K-500K | Targeted audience, realistic ranking |
| Branded or micro | under 10K | Community, easy to rank |

Method: list 5 content pillars, find broad and niche tags by searching the app, add branded tags, test two or three sets and rotate based on results. Place tags after the caption or in the first comment; both work, so test. Never pad with unrelated tags.

## Image brief (when no image exists)

Give: subject, composition, light and color, text on image (if any), aspect ratio (4:5 portrait or 1:1 are the common feed choices; confirm in the app), and how it connects to the hook. For generation use `image-prompt-engineer` and `visual-brand-kit`; to execute with a provider key use `media-forge`. Generation can cost money: say so before running it.

## Cadence

Instagram suggests no universal numbers. A common creator range is 3 to 5 feed posts a week; use Instagram Insights for the account's active hours.

## Link in bio

Match the top link to the current campaign. A caption that says "link in bio" should say what is there. Track clicks per link.

## Output format

```
Hook: [under 125 characters]

Caption:
[hook]

[body]

[CTA]

Hashtags: [set]
Alt text: [one or two sentences describing the image]
Image brief: [only if no image exists]
First comment: [optional: hashtags or a link note]
```

Offer two hooks when undecided.

## Genfeed integration

If Genfeed tools are available:

- `generate_content` with `{type: "caption", platform: "instagram", topic, brandId}` gives a starting draft to edit.
- `create_post` saves the draft with `platforms: ["instagram"]` and `mediaUrls`. It does not publish.
- Use `check_channel` with `{action: "capabilities", input: {platform: "instagram"}}` for media rules.
- Publishing goes through `social-poster`, only on explicit confirmation.

The skill works fully without Genfeed.

## Checklist

- [ ] Hook lands in the first 125 characters
- [ ] Caption gives real value
- [ ] Clear CTA
- [ ] Relevant hashtags only
- [ ] Alt text added
- [ ] Image quality and brand fit confirmed
- [ ] Every fact and number is real
- [ ] Ready to reply to comments in the first hour
