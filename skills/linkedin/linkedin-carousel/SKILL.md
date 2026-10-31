---
name: linkedin-carousel
description: Plan and write a LinkedIn carousel (a swipeable PDF document post); slide outline, copy per slide, design rules, caption, and handoff to a local renderer for finished PNG and PDF slides. Use for "LinkedIn carousel", "PDF post", "turn this into slides for LinkedIn". For a text post use linkedin-post; for an Instagram carousel use instagram-carousel.
license: MIT
metadata:
  author: genfeedai
  version: 1.0.0
---

# LinkedIn Carousel

Write a LinkedIn document post: a swipeable slide deck uploaded as a PDF. LinkedIn treats it as a native document, and it suits frameworks, step-by-step guides, comparisons and lessons learned.

This skill produces the outline, the copy for every slide, the design spec and the caption. To get finished slides, hand the spec to `carousel-renderer` when it is installed. If it is not installed, deliver the spec and say that rendering is a separate step.

## Inputs

- The idea, source notes or an article to condense. Do not invent statistics, quotes or examples.
- The reader and the one takeaway.
- Brand: colors, fonts, logo, voice. See `visual-brand-kit` or the conversation.
- Slide count (default 8 to 12) and format (portrait 1080x1350 or square 1080x1080; check what the renderer supports).

## Workflow

1. **Choose the framework** from the table below.
2. **Outline** one idea per slide, in an order that earns each swipe.
3. **Write slide copy** within the word limits.
4. **Write the caption** (a short [linkedin-post](../linkedin-post/SKILL.md)-style hook plus a CTA).
5. **Render** with carousel-renderer if installed; view the output before reporting.
6. **Check** against the list at the end.

## Structure

| Slide | Purpose | Notes |
|-------|---------|-------|
| 1 (cover) | Hook plus title | Bold headline, author name, swipe cue ("Swipe →") |
| 2 | Problem | "Most people/companies [pain]..." |
| 3-10 | Value | One insight per slide, large text, same layout |
| 11 | Summary | "Key takeaways" plus 3 to 5 bullets |
| 12 (CTA) | Action | Follow, repost, or comment with a specific prompt |

Shorter decks are fine. Cut slides that restate others.

## Frameworks

| Framework | Example |
|-----------|---------|
| Myths versus reality | "10 hiring myths that cost you great talent" |
| Step-by-step | "How to negotiate your salary in 7 steps" |
| Before and after | "Junior vs senior developer thinking" |
| Comparison | "Managers vs leaders: 8 differences" |
| Framework | "The RICE framework for product prioritization" |
| Lessons learned | "12 lessons from 12 years in marketing" |
| Tools and resources | "8 free tools every founder should know" |

## Design rules

1. Consistent branding: same colors, fonts and layout on every slide.
2. At most 3 font sizes: headline, body, caption.
3. Large text, readable on a phone (aim for under about 35 words a slide).
4. One idea per slide.
5. White space; let the content breathe.
6. Vary text slides with diagram or icon slides.
7. Page numbers ("3/12") help readers track progress.
8. Swipe cue on slide 1.
9. High contrast; never rely on color alone to carry meaning.

## Output format

```
Framework: [name]   Format: [1080x1350 | 1080x1080]   Slides: [N]

Slide 1 (cover): [Title] / [Subtitle]
Slide 2: [Headline] / [Support line]
...
Slide N (CTA): [Action]

Caption: [post text; hook in the first two lines]
Hashtags: [3-5]
Alt text: [one line per slide, or a deck-level description]
Design notes: [colors, fonts, logo placement, visuals per slide]
```

If rendered, add the output paths for the PNGs and the PDF, and what you checked by viewing them.

## Rendering

`carousel-renderer` (when installed) turns a slide spec into PNGs and a PDF locally with a headless browser, with no image API. Pass it the slide copy and brand tokens from this skill. Check the rendered slides for clipped text and contrast before handing over. For generated illustrations or background art use `image-prompt-engineer` and `media-forge`.

## Distribution

- Upload the PDF as a document post; add a title.
- Keep links out of the caption; put them in the first comment.
- Post mid-week mornings in the audience's time zone, and reply to comments in the first hour.
- LinkedIn does not publish ranking weights; the claim that documents outperform text is a common creator heuristic, so test it against the account's analytics.

## Genfeed integration

If Genfeed tools are available:

- `upload_media` stores the rendered PDF or PNGs; `create_post` saves a draft with `platforms: ["linkedin"]` and the media. It does not publish.
- Publishing goes through `social-poster`, only on explicit confirmation.

The skill works fully without Genfeed.

## Checklist

- [ ] Cover states a specific promise
- [ ] One idea per slide, short copy
- [ ] Consistent layout and brand
- [ ] Every number and claim is real and sourced
- [ ] Swipe cue on slide 1; CTA on the last slide
- [ ] Caption hook in the first two lines; link in the first comment
- [ ] Alt text provided
- [ ] If rendered: slides viewed for clipping and contrast
