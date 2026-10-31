---
name: x-post
description: Write a single X (Twitter) post, quote post or reply that earns attention on its own. Covers hooks, the 280-character edit, quote and reply tactics, algorithm signals and a pre-post checklist. Use for "write a tweet", "draft an X post", "quote tweet", "reply to this post". For multi-post threads use x-thread; for long-form use x-article.
license: MIT
metadata:
  author: genfeedai
  version: 1.0.0
---

# X Post

Write one X post that lands in a single punch: a standalone post, a quote post or a reply. A post is the atomic unit of X. If the idea needs more than one post, hand off to [x-thread](../x-thread/SKILL.md); if it needs a document, hand off to [x-article](../x-article/SKILL.md).

## Core principles

1. **Brevity is power.** Every word earns its place. If a sentence can be shorter, make it shorter.
2. **Value before vanity.** Content that teaches, challenges or reveals outperforms content that brags. Lead with what the reader gets, not what you did.
3. **Pattern interrupt.** The timeline is noise. The first 5 to 10 words must break the pattern.

## Inputs

- The idea, the point of view and any real facts, numbers or quotes the user supplied. Do not invent statistics, results or testimonials.
- The brand or personal voice (from the conversation, a brand profile or recent posts).
- The goal: authority, follows, replies, bookmarks, traffic or a launch.

## Workflow

1. **Pick the angle.** One claim, one reader, one reason to care.
2. **Write the hook** (formulas below). It must work if nothing else is read.
3. **Write 3 variants** with different hooks, not three rewordings of one.
4. **Cut.** Remove setup sentences, hedging and filler.
5. **Check** against the checklist, then hand over copy ready to paste.

## Single post structure

```
[Hook: first 5-10 words stop the scroll]
[Core insight or value: 1-2 sentences]
[CTA or punchline: optional]
```

The base limit is 280 characters. Longer posts exist for some accounts; check the live composer or Genfeed's `check_channel` capabilities instead of recalling numbers. Do not force brevity on an idea that needs room, but never pad.

### Hook formulas

| Formula | Example |
|---------|---------|
| Contrarian opener | "Most marketing advice is wrong." |
| Curiosity gap | "The #1 reason startups fail isn't money." |
| Direct command | "Stop building features nobody asked for." |
| Bold claim | "Cold email is the most underrated growth channel in 2026." |
| Vulnerability | "I almost quit last month. Here's why I didn't." |
| Data-driven | "We tested 1,000 subject lines. Here's what won." (only with real data) |
| Question hook | "What's the one skill that 10x'd your career?" |
| Time-boxed result | "I grew from 0 to 10K followers in 90 days." (only if true) |

### Engagement patterns

| Pattern | Why it works | Example |
|---------|-------------|---------|
| Hot take | Triggers agree/disagree replies | "Hustle culture is just poor time management with better marketing." |
| Relatable pain | People share what validates them | "The hardest part of building a startup isn't the code. It's the silence." |
| Useful tip | Gets bookmarked | "Write your tweets at night. Schedule for 8am. Morning you has bad ideas." |
| Story micro-arc | Narrative pulls readers | "2019: laid off. 2020: learned to code. 2021: first SaaS." |
| Incomplete thought | Drives replies asking for more | "The best hire I ever made had zero experience in our industry." |

### Call-to-action techniques

| CTA | Template |
|-----|----------|
| Engagement | "Reply with yours." |
| Follow | "Follow for daily [topic] notes." |
| Bookmark | "Bookmark this. You'll need it." |
| Repost | "Repost to help someone who needs this." |
| Reply bait | "What's your version of this?" |
| Thread tease | "Breaking it down below." (then use [x-thread](../x-thread/SKILL.md)) |

### Bad versus good

**Bad:**
> "Had a great meeting today about our product roadmap! Excited about what's coming. Stay tuned! #startup #product #excited"

Vague, no value, hashtag spam, "stay tuned" is empty.

**Good:**
> "We killed our most-requested feature today. Users wanted it. Data said otherwise. Revenue up 23% in two weeks. Sometimes the hardest product decision is saying no to your customers."

Specific, counterintuitive, teaches a lesson. (Illustrative: use only numbers the user can back up.)

## Quote posts

A quote post rides someone else's reach while adding your own value. Done wrong it is parasitic.

| Strategy | Template | Use when |
|----------|----------|----------|
| Add context | "This is spot on. The part people miss: [insight]" | You have unique experience |
| Contrarian take | "Respectfully disagree. Here's why: [reasoning]" | You have data or evidence |
| Personal story | "This happened to me. [Brief story]. [Lesson]." | You have a relevant anecdote |
| Amplify and extend | "Underrated advice. I'd add one thing: [addition]" | The original is strong |
| Data layer | "The data backs this up: [stat or study]" | You have a real source |
| Framework | "Great point. A simple framework for this: [framework]" | You can systematize the insight |

Rules:

- Always add value. Never just "This" or "100%".
- Credit the original author. Do not restate their point as your own.
- Keep the addition short; the quoted post already gives context.
- If you disagree, be specific and respectful: "I see it differently because..." not "Wrong."

## Replies

Replies are the most underrated growth lever on X.

| Framework | How it works | Example |
|-----------|-------------|---------|
| Add data | Support the post with a specific stat or example | "Our data shows the same: 73% of B2B buyers prefer async demos." (only if real) |
| Share experience | A brief, relevant story | "Experienced this at my last company. We solved it by [solution]." |
| Ask a smart question | Show you read it and want to go deeper | "Curious: did this hold for enterprise vs SMB?" |
| Provide a resource | A link, tool or reference that adds value | "Related: [author] wrote a deep dive on this: [link]" |
| Respectful challenge | A different perspective with reasoning | "Interesting. I've seen the opposite in [context]." |

Timing: replies in the first 30 minutes of a post get the most visibility; after about 4 hours they rarely get seen unless the post is still growing. Read the whole conversation first, add real value, and engage with replies to your own reply.

## Algorithm signals

| Signal | Weight | How to optimize |
|--------|--------|-----------------|
| Bookmarks | Highest | Reference-worthy content: lists, frameworks, templates |
| Replies | Very high | Ask questions, take a position, invite stories |
| Reposts | High | Quotable "I wish I said this" lines |
| Likes | Medium | Emotional resonance, agreement, humor |
| Link clicks | Low to medium | Tease; do not reveal everything in the post |
| Profile visits | Medium | A hook that makes people check who you are |

These weights are working heuristics from public creator guidance, not published X numbers. Treat them as defaults and check against the account's own analytics.

**Boosters:** an image or chart, a poll for opinion content, replying to every comment in the first hour, a self-reply that extends the idea, links placed in a reply instead of the main post.

**Killers:** an external link in the main post, more than 2 hashtags, engagement bait that does not deliver, posting and ghosting, gaps longer than 48 hours.

### Timing

| Audience | Best times (local) | Best days |
|----------|-------------------|-----------|
| B2B / tech | 7-9am, 12-1pm, 5-6pm | Tue, Wed, Thu |
| B2C / general | 8-10am, 7-9pm | Mon, Wed, Sat |
| Global | 8am and 2pm EST | Tue-Thu |

Use the account's own analytics when available.

## Viral patterns

| Pattern | Shape |
|---------|-------|
| Controversial opinion | Bold claim, why you hold it, evidence, invitation to discuss |
| Storytelling arc | Low point, context, decision, result, lesson |
| Data-driven insight | Surprising number, source, what most people get wrong, takeaway |
| Vulnerability | Honest admission, what you learned, how it changed your approach |
| Before and after | Before state, the bridge, after state, the framework |

## Output format

Return the final post text only, ready to paste:

```
[The post, max 280 characters unless the account supports more]
```

For a quote post:

```
[Your addition]

> QT: [Short description of the original post, with author]
```

For a reply:

```
Replying to: [author / one-line summary of the post]
[Reply text]
```

When asked for options, label them A, B, C and say in one line what differs.

## Media

Posts with an image or chart tend to travel further. For a branded image use `image-prompt-engineer` and `visual-brand-kit`; for a short video use `motion-video` if it is installed. Alt text goes on every image.

## Genfeed integration

If Genfeed tools are available:

- `create_post` saves the chosen variant as a draft with `platforms: ["twitter"]`. It does not publish.
- Use `check_channel` with `{action: "capabilities", input: {platform: "twitter"}}` for limits and media rules.
- Use brand context from the conversation for voice. Publishing goes through `social-poster` and only on explicit confirmation.

The skill works fully without Genfeed.

## Checklist

- [ ] Hook in the first 5-10 words
- [ ] Within the character limit
- [ ] Clear value: teaches, reveals, challenges or entertains
- [ ] Zero to two hashtags
- [ ] No external link in the main post (move it to a reply)
- [ ] A CTA or an invitation to respond, if it fits
- [ ] Every number and quote is real and sourced
- [ ] Would you stop scrolling for this?
- [ ] Proofread
