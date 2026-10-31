---
name: instagram-carousel
description: Plan and write an Instagram carousel; slide-by-slide copy, design spec, caption, hashtags and handoff to a local renderer for finished PNG slides. Use for "Instagram carousel", "carousel outline", "turn this into swipeable slides". For a single image use instagram-post; for LinkedIn use linkedin-carousel.
license: MIT
metadata:
  author: genfeedai
  version: 1.0.0
---

# Instagram Carousel

Write an Instagram carousel: a multi-slide post people swipe through. It suits education, frameworks, checklists and step-by-step guides, and tends to get saved.

This skill produces the outline, the slide copy, the design spec and the caption. For finished slides, hand the spec to `carousel-renderer` when it is installed. If it is not installed, deliver the spec and say rendering is a separate step.

For one image use [instagram-post](../instagram-post/SKILL.md). For a professional document post use `linkedin-carousel`.

## Inputs

- The idea, source notes or an article to condense. Do not invent statistics, quotes or examples.
- The audience and the single takeaway.
- Brand: colors, fonts, logo, voice. See `visual-brand-kit` or the conversation.
- Slide count (default 8 to 10) and format (4:5 portrait is the usual choice; the renderer handles 1080x1350 and 1080x1080).

## Workflow

1. **Pick the topic formula** below.
2. **Outline** one idea per slide with a reason to swipe on each.
3. **Write slide copy** within the word limits.
4. **Write the caption** and hashtags (see [instagram-post](../instagram-post/SKILL.md) for hook, CTA and hashtag rules).
5. **Render** with carousel-renderer if installed, and view the output.
6. **Check** against the list below.

## Structure (10 slides)

| Slide | Purpose | Copy guidance |
|-------|---------|--------------|
| 1 (cover) | Stop the scroll | Bold headline of 5 to 8 words, optional subtitle, high contrast |
| 2 | Set the problem | "Most people [mistake]..." |
| 3-8 | Deliver value | One point per slide, short sentences, bullets or numbers |
| 9 | Summarize | "Quick recap" plus 3 to 5 bullets |
| 10 (CTA) | Action | "Save this", "Send to someone who needs it", "Follow for more" |

Fewer slides is fine. Cut any slide that restates another.

## Slide copy rules

1. Max about 30 words per slide.
2. One idea per slide.
3. Visual hierarchy: big headline, smaller support text, strong contrast.
4. Same font, colors and layout on every slide.
5. Icons or numbers as bullets; they scan faster than dashes.
6. Alternate text-heavy and visual slides.
7. End each slide with a reason to swipe ("But that's not all...", or let point 3 lead into point 4).
8. Keep the cover legible as a small grid thumbnail.

## Topic formulas

| Niche | Formula | Example |
|-------|---------|---------|
| Business | "X mistakes [audience] make with [topic]" | "7 mistakes freelancers make with pricing" |
| Health | "X [habits] for [benefit]" | "5 morning habits for better energy" |
| Tech | "X tools that replaced [expensive thing]" | "6 free tools that replaced my $500/mo stack" |
| Creative | "X techniques to improve your [skill]" | "8 composition rules that transform photos" |
| Finance | "X things I wish I knew about [topic] at [age]" | "10 things I wish I knew about investing at 25" |

Examples are illustrations. Use the user's real numbers and tools.

## Output format

```
Topic formula: [name]   Format: [1080x1350 | 1080x1080]   Slides: [N]

Slide 1 (cover): [Headline] / [Subtitle]
Slide 2: [Point]
...
Slide N (CTA): [Action]

Caption: [hook under 125 characters, body, CTA]
Hashtags: [relevant set]
Alt text: [per slide or a deck description]
Design notes: [colors, fonts, logo, visuals per slide]
```

If rendered, add the PNG paths and what you checked by viewing them.

## Rendering

`carousel-renderer` (when installed) turns a slide spec into branded PNGs locally with a headless browser, with no image API. Pass it the slide copy and brand tokens. Check each slide for clipped text and contrast. For generated illustrations or backgrounds use `image-prompt-engineer` and `media-forge`; generation can cost money, so say so first.

## Genfeed integration

If Genfeed tools are available:

- `upload_media` stores the slides; `create_post` saves a draft with `platforms: ["instagram"]` and `mediaUrls`. It does not publish.
- Use `check_channel` with `{action: "capabilities", input: {platform: "instagram"}}` for the carousel slide limit and media rules before building the deck.
- Publishing goes through `social-poster`, only on explicit confirmation.

The skill works fully without Genfeed.

## Checklist

- [ ] Cover is a clear promise, legible as a thumbnail
- [ ] One idea per slide, about 30 words or fewer
- [ ] Consistent brand across all slides
- [ ] Every claim and number is real
- [ ] CTA on the last slide; caption hook under 125 characters
- [ ] Slide count within the platform limit (checked, not assumed)
- [ ] Alt text added
- [ ] If rendered: slides viewed for clipping and contrast
