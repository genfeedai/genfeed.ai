---
name: linkedin-article
description: Write a LinkedIn article or a LinkedIn newsletter edition; keyword-aware long-form of 1,500-2,500 words with a hook, sections, action steps and a feed post to promote it. Use for "write a LinkedIn article", "LinkedIn newsletter edition", "turn this into a LinkedIn article". For a short post use linkedin-post; for a PDF carousel use linkedin-carousel.
license: MIT
metadata:
  author: genfeedai
  version: 1.0.0
---

# LinkedIn Article

Write a LinkedIn long-form piece: a native article or one edition of a LinkedIn newsletter. Articles can be indexed by search engines and give depth that a feed post cannot. Genfeed Cloud treats LinkedIn Article as its own article category.

For a feed post use [linkedin-post](../linkedin-post/SKILL.md). For a search-first piece on your own site use `blog-content-creator`.

## Inputs

- The thesis in one sentence and the reader (role, problem).
- Source material: notes, data, transcripts, case details. Do not invent numbers, quotes or customer results; mark gaps `[needs source]`.
- Primary keyword if search matters.
- Whether this is a one-off article or a newsletter edition.
- Voice and brand context.

## Workflow

1. **Thesis and reader.** One claim, one reader.
2. **Outline** with the template below; assign a word budget per section.
3. **Draft** opening, sections, action steps, conclusion.
4. **Optimize** title and first 100 words for the primary keyword with `content-seo-optimizer` when search matters.
5. **Review** with `content-reviewer` and clean the voice with `humanizer` if it reads generic.
6. **Package:** hero image brief, pull quotes, the feed post that promotes it, and the first comment.

## Article template

```
# [Title: keyword-aware, benefit clear, under ~70 characters]

## Introduction (150-200 words)
Hook with a story, stat or bold claim
Preview what the reader will get
Why this matters now

## Section 1: [claim as H2] (300-400 words)
Core argument, evidence, a pull quote as a blockquote

## Section 2: [claim as H2] (300-400 words)
Build on section 1, practical application, real examples

## Section 3: [claim as H2] (300-400 words)
The counterargument or nuance, when this does not apply

## Action steps (200-300 words)
Numbered, specific, time-bound where possible

## Conclusion (100-150 words)
Restate the core insight, look forward, one CTA
```

Length is a range, not a goal. Stop when the thesis is proven.

## Writing rules

- Headings state a point ("Pricing hides the real cost"), not a topic ("Pricing").
- One idea per paragraph, 1 to 4 sentences.
- Show the example or number before the abstraction.
- Cite sources by name; link them. Keep qualifications that change the conclusion.
- Bold key phrases for scanning, not whole sentences.
- Link your related articles and relevant external sources.
- No filler close. End on the next action.

## SEO and distribution

- Primary keyword in the title and the first 100 words; keywords in H2 and H3 where natural.
- Custom hero image (about 1200x628 px is the usual guidance; check the editor).
- Publish Tue to Thu mornings in the audience's time zone, unless analytics say otherwise.
- Promote with a native feed post written with [linkedin-post](../linkedin-post/SKILL.md): hook, one insight, link in the first comment.
- Reply to comments in the first hour.

## Newsletter edition

LinkedIn newsletters notify subscribers when an edition publishes, which makes cadence matter more than any single piece.

```
Subject / title: [benefit-driven, curiosity-inducing, under ~50 characters]

Opening (100-150 words): personal anecdote or timely hook, what this edition covers
Main section (800-1,200 words): deep dive with data, examples, frameworks
Quick hits (200-300 words): 3-5 short observations, links or recommendations
Reader question (100-150 words): answer one, or pose one for next time
CTA: subscribe, share with one colleague, reply with what to cover next
```

Tactics: promote every edition with a native feed post, keep a consistent cadence, use the first edition to say what, when and why subscribe, and cross-reference past editions. For multi-channel newsletters use `newsletter-creator`.

## Output format

```
Title: [title]
Primary keyword: [keyword]
Hero image brief: [one sentence]

[Full article in Markdown with H2/H3 headings and blockquote pull quotes]

Pull quotes: [2-3]
Feed post: [promo text]
First comment: [link and one-line context]
Sources and gaps: [list]
```

## Genfeed integration

If Genfeed tools are available:

- `get_articles` shows existing articles, to match tone and avoid repeat topics.
- `create_post` saves the promo post as a draft with `platforms: ["linkedin"]`. It does not publish.
- Publishing goes through `social-poster`, only on explicit confirmation.

The skill works fully without Genfeed.

## Checklist

- [ ] One thesis, clear in the title and intro
- [ ] Headings state points
- [ ] Every number, quote and result is real and sourced, or marked `[needs source]`
- [ ] Action steps are specific
- [ ] Primary keyword in title and first 100 words (if search matters)
- [ ] Hero image brief and alt text
- [ ] Promo post and first comment written
- [ ] Reviewed with content-reviewer
