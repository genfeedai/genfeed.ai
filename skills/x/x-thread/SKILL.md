---
name: x-thread
description: Write an X (Twitter) thread of 2 to 15 posts with a hook, a value chain and a closing CTA. Covers opening templates, one-idea-per-post rules, formatting, the self-reply TL;DR and bump. Use for "write a thread", "turn this into a thread", "X thread on...". For a single post use x-post; for long-form use x-article.
license: MIT
metadata:
  author: genfeedai
  version: 1.0.0
---

# X Thread

Write a thread: a connected run of 2 to 15 posts that builds authority and earns follows and bookmarks. Threads are the right format when the idea has steps, a story or a list. If it fits one post, use [x-post](../x-post/SKILL.md). If it needs headings and a reference-grade layout, use [x-article](../x-article/SKILL.md).

## Inputs

- The source: an idea, notes, a blog post, a transcript or a talk. Do not invent numbers, results or quotes.
- The reader and the one thing they should walk away with.
- The goal: follows, bookmarks, replies, a launch or traffic.
- Voice and brand context.

## Workflow

1. **State the promise** in one sentence. If you cannot, the thread is not ready.
2. **Choose the shape:** listicle, story, framework, teardown, behind the scenes, transformation, resource list.
3. **Outline** one idea per post, in the order that builds tension.
4. **Write the hook post last or twice.** It carries the thread.
5. **Write the body**, then the recap and CTA.
6. **Edit for length:** cut every post that restates another. Eight good posts beat fifteen padded ones.
7. **Check** against the list at the end.

## Structure

```
Post 1:    HOOK. The promise. What will they learn or gain?
Post 2:    CONTEXT. Why should they care? (skip if the hook already says it)
Post 3-N:  VALUE CHAIN. One clear point per post.
Post N-1:  SUMMARY. Recap the takeaways.
Post N:    CTA. Follow, bookmark, repost or reply.
```

Save your strongest point for post N-2, right before the summary.

## Opening hooks

| Template | Example |
|----------|---------|
| Listicle promise | "10 lessons from scaling a SaaS to $5M ARR (that no one talks about):" |
| Story setup | "In 2022, I made a decision that nearly killed my company. Here's the full story:" |
| Contrarian framework | "Everything you've been told about SEO is outdated. Here's what works in 2026:" |
| Behind the scenes | "We just hit 100K users. Here's exactly what we did:" |
| Transformation | "6 months ago I couldn't close a deal. Now I close 40% of calls. The framework:" |
| Resource compilation | "I've spent $50K on courses. These 7 free resources taught me more:" |

The numbers in these examples are illustrations. Use only what the user can back up. The hook promises something specific and the thread must deliver it.

## Value chain rules

1. **One idea per post.** Never cram two points into one.
2. **Each post stands alone.** Someone landing on post 7 should still get value.
3. **Number the points** ("1/" or "Step 1:") so readers can track progress.
4. **Use line breaks.** Dense paragraphs die on mobile.
5. **Vary length.** Mix punchy one-liners with detailed paragraphs.
6. **Add proof:** a screenshot, a number, an example, a before and after.
7. **Build tension.** Each post earns the next one.

Per-post limits follow X's rules for the account. For the live numbers use Genfeed's `check_channel` capabilities or the composer, not memory.

## Closing CTAs

| Template | Example |
|----------|---------|
| Recap and follow | "TL;DR: [3 bullets]. Follow for more [topic]." |
| Action prompt | "Pick ONE of these and try it this week. Reply with which one." |
| Resource offer | "I turned this thread into a free PDF. Link in the reply." |
| Community build | "Who else is working on [topic]? Drop what you're building." |
| Bookmark nudge | "This took me 5 years to learn. Bookmark it." |

## Formatting and distribution

- Mark the first post as a thread ("Thread:" or a 1/N counter) so people know more is coming.
- Put external links in the last post or a reply, not the first post.
- Add a visual to the hook post when one exists. See `image-prompt-engineer` and `carousel-renderer` (if installed) for a branded chart or card.
- Pin a self-reply with a TL;DR for late arrivals.
- Quote your own opener as a bump 4 to 6 hours later, with a new angle, not a copy.
- Reply to every comment in the first hour.

## Output format

```
1/ [Opening hook post]

2/ [Second post]

3/ [Third post]

...

N/ [Closing CTA post]
```

Add after the thread:

```
Pinned self-reply: [TL;DR]
Bump (4-6h later): [new angle quote of post 1]
Media: [what image or chart goes on which post]
```

If the user wants options, provide two different hooks for post 1, not two full threads.

## Genfeed integration

If Genfeed tools are available:

- `generate_content` with `{type: "thread", platform: "twitter", topic, brandId}` produces a starting draft. Edit it against the rules above.
- `create_post` saves the final thread as a draft with `platforms: ["twitter"]`. It does not publish.
- Publishing goes through `social-poster`, only on explicit confirmation.

The skill works fully without Genfeed.

## Checklist

- [ ] Post 1 makes a specific promise a stranger would care about
- [ ] One idea per post; no post restates another
- [ ] Every post stands alone
- [ ] Numbers, quotes and results are real
- [ ] No external link in post 1
- [ ] Strongest point is near the end, before the recap
- [ ] The CTA asks for one thing
- [ ] Every post fits X's limits for the account
- [ ] Proofread on a phone-width view
