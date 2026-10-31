---
name: x-article
description: Write a long-form X Article, a titled and structured piece published natively on X, plus the promo post that sends the timeline to it. Covers title, header image, section structure, formatting and the launch post. Use for "write an X article", "long-form post on X", "turn this blog post into an X article". For a thread use x-thread; for a short post use x-post.
license: MIT
metadata:
  author: genfeedai
  version: 1.0.0
---

# X Article

Write a long-form piece for X's native Article format and the post that promotes it. Genfeed Cloud treats X Article as its own article category, separate from a thread and from a blog post. An article is for ideas that need headings, evidence and room: a position, a playbook, a case study, a launch story.

Use [x-post](../x-post/SKILL.md) for one idea and [x-thread](../x-thread/SKILL.md) for a sequence of short posts. Use `blog-content-creator` when the piece is search-first and lives on your own site.

## What is not verified here

X changes Article eligibility, length, formatting options and media limits. This skill does not encode them. Before promising the user a layout, check the current composer (which accounts can publish Articles, supported blocks such as headings, lists, quotes, images and embeds, any length limit) or Genfeed's `check_channel` capabilities. If you cannot check, say "unverified" and write in plain Markdown that survives pasting into any editor.

## Inputs

- The thesis in one sentence, and who needs to hear it.
- Source material: notes, a transcript, a talk, data, screenshots. Do not invent statistics, quotes or customer results; mark a gap as `[needs source]`.
- The goal: authority, follows, signups, a launch.
- Voice and brand context.

## Workflow

1. **Thesis.** One claim the reader can repeat. If the piece makes three claims, it is three pieces.
2. **Reader and payoff.** What do they know now, and what will they be able to do or decide after?
3. **Outline.** Headline, opening, 3 to 6 sections, close. One job per section.
4. **Draft** in the order: opening, sections, close, then title and subtitle last.
5. **Edit** for density: cut throat-clearing, repeat claims and anything the reader already knows.
6. **Package:** title, subtitle or summary line, header image brief, pull quotes, promo post.
7. **Check** against the list at the end.

## Structure

```
Title                  the claim or the outcome, plain words
Subtitle (optional)    who it is for or what they get
Header image           one idea, readable at thumbnail size

Opening (80-150 words) the stakes or the story; what the reader will get
Section 1-N            H2 heading that states the point, not the topic
  - claim, evidence, example, consequence
  - one pull quote or key line per 2-3 sections
Close                  what to do next; one CTA
```

A typical piece is 800 to 2,000 words. Length is not a goal: stop when the thesis is proven.

## Titles

| Pattern | Example |
|---------|---------|
| Outcome | "How we replaced a 5-tool content stack with one workflow" |
| Contrarian | "Your content calendar is the reason you are not growing" |
| Specific number | "7 rules we use to review every post before it ships" |
| Story | "What a failed launch taught us about distribution" |

Use real claims and real numbers. Avoid "You won't believe" and unexplained hype. The title promises; the opening delivers the first proof within 3 sentences.

## Writing rules

- **Open with the reader's problem or a specific moment,** not a definition and not "In today's fast-paced world".
- **Headings are claims.** "Short posts hide the reasoning" beats "Background".
- **One idea per paragraph,** 1 to 4 sentences. Mobile readers scan.
- **Show, then say.** An example, a screenshot or a number before the abstraction.
- **Keep the qualification** when removing it would change the conclusion.
- **Use lists** only for parallel items. Use quotes sparingly, for lines worth repeating.
- **Embed or link** your own posts and sources where they prove a point, and name them.
- **No filler close.** End on the next action, not a summary of the summary.

## Promo post

The Article needs a post to travel. Write the promo as a standalone [x-post](../x-post/SKILL.md): a hook that stands without the link, the single best insight, and the Article link in the post or the first reply. Do not paste the headline and "new article". Offer two variants with different hooks.

Optional follow-ups: a short [x-thread](../x-thread/SKILL.md) that unpacks one section, and a bump post 4 to 6 hours later with a different angle.

## Header image and visuals

Give a one-sentence image brief: subject, composition, text on image (if any), aspect ratio per the composer. For generation use `image-prompt-engineer` and `visual-brand-kit`. For charts and data cards, `carousel-renderer` can render PNGs locally if it is installed. Add alt text for every image.

## Output format

```
Title: [title]
Subtitle: [optional]
Header image brief: [one sentence]

[Full article in Markdown: H2/H3 headings, short paragraphs, pull quotes as > blockquotes]

Pull quotes: [2-3 lines]
Promo post A: [text]
Promo post B: [text]
Sources and gaps: [list of claims that need a source]
```

## Genfeed integration

If Genfeed tools are available:

- Genfeed Cloud has an X Article category. Use `get_articles` to read existing articles for tone and to avoid repeating topics.
- `create_post` saves the promo post as a draft with `platforms: ["twitter"]`. It does not publish.
- Publishing goes through `social-poster`, only on explicit confirmation.
- Run `content-reviewer` before handoff.

The skill works fully without Genfeed.

## Checklist

- [ ] One thesis, stated in the title or the first lines
- [ ] Opening gives the first proof within 3 sentences
- [ ] Headings state points, not topics
- [ ] Every number, quote and result is real and sourced, or marked `[needs source]`
- [ ] No filler opening and no summary-of-the-summary close
- [ ] One CTA
- [ ] Header image brief and alt text provided
- [ ] Promo post works without the link
- [ ] Format limits checked or marked unverified
- [ ] Reviewed with content-reviewer
