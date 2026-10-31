---
name: linkedin-post
description: Write a LinkedIn text post; story, insight, contrarian, listicle, celebration or objection-to-thought-leadership. Covers hooks, the 1,000-1,300 character shape, tone, hashtags, first-comment links, comment strategy and a pre-publish checklist. Use for "write a LinkedIn post", "thought leadership post". For long-form use linkedin-article; for a document/PDF post use linkedin-carousel.
license: MIT
metadata:
  author: genfeedai
  version: 1.0.0
---

# LinkedIn Post

Write one LinkedIn text post that builds authority and starts a real conversation. For a long-form piece use [linkedin-article](../linkedin-article/SKILL.md). For a swipeable PDF post use [linkedin-carousel](../linkedin-carousel/SKILL.md).

## Core principles

1. **Professional, not corporate.** Write like a smart colleague sharing insight over coffee, not a press release.
2. **Dwell time is king.** Well-structured longer posts tend to beat short ones, but only if every line earns attention.
3. **Teach through experience.** "Here's what happened to me" plus "here's what it means for you."

## Inputs

- The experience, opinion, data point or win, with real details. Do not invent stories, numbers or names.
- The reader (role, seniority, industry) and the action you want.
- Voice and brand context. Anonymize prospects and colleagues unless they agreed to be named.

## Workflow

1. **Pick the format** from the six below.
2. **Write the hook** (first two lines; they show before "see more").
3. **Draft** in short paragraphs of 1 to 2 sentences with whitespace.
4. **Land one lesson,** then one question that invites real answers.
5. **Edit** against the "never use" list and the checklist.
6. **Plan the first comment** (link, resource) and the reply window.

## Formats

### 1. Story post (narrative plus lesson)

The most engaging format. Hook, setup (2-3 lines), conflict, resolution, lesson, CTA question.

```
I got fired on a Tuesday.

Not for performance. Not for misconduct. For asking the wrong question in a meeting.

[...setup, conflict, resolution...]

The quality of your questions determines the quality of your career.
But only if you're in a room that welcomes them.

What's a question you asked that changed everything?
```

### 2. Insight post (data or trend plus take)

Hook with a surprising stat, the evidence and its source, your analysis, the implication, a CTA asking for others' view. Cite the source; never invent the statistic.

### 3. Contrarian post

Hook with a belief-contradicting statement, "I know this sounds wrong, here's why", evidence, the nuance (when the conventional wisdom is right), the reframe, an invitation to debate.

| Conventional wisdom | Contrarian take |
|--------------------|-----------------|
| "Always follow your passion" | "Follow curiosity. Passion is discovered through competence." |
| "Network as much as possible" | "Stop networking. Start contributing." |
| "Move fast and break things" | "Move deliberately and fix things." |
| "Data-driven decisions" | "Most companies are data-decorated, not data-driven." |

### 4. Listicle post

Hook with the promise plus credibility, 5 to 10 numbered one-line points, a one-line recap, a CTA asking which point resonated.

### 5. Celebration post (win plus gratitude)

State the achievement with specifics, the journey, credit named people (with their permission), the lesson, thanks. Include the struggle. Avoid humble-bragging. Make it useful.

### 6. Sales objection to thought leadership

Voice the objection as a universal belief, acknowledge it, reveal the assumption underneath, reframe, give your direct point of view.

| Objection | Post angle |
|-----------|-----------|
| "We don't have budget for that" | "Budget isn't the real objection. Uncertainty is." |
| "We're happy with what we have" | "The thing about tools you're happy with..." |
| "We'll revisit this next quarter" | "Next quarter is code for something specific." |
| "We tried this before and it didn't work" | "Every 'it didn't work' has a backstory." |

Rules: never identify the prospect, validate before reframing, no product pitch in the body, end with a question both buyers and sellers can answer, keep it under about 1,100 characters.

## Hooks

| Formula | Example |
|---------|---------|
| Admission | "I was wrong about remote work." |
| Experience plus surprise | "After 15 years in sales, here's what nobody tells you." |
| Observation gap | "Everyone talks about AI. Nobody talks about the humans it replaces." |
| Direct challenge | "Your company culture isn't what's on your careers page." |
| Result plus timeline | "I grew my team from 3 to 30 in 18 months." (only if true) |
| Pattern interrupt | "I don't have a morning routine." |
| Micro-story | "The best manager I ever had never gave me feedback." |

### Never use

| Avoid | Why |
|-------|-----|
| "I'm humbled to announce..." | Overused, sounds insincere |
| "I'm excited to share..." | Generic opener, zero hook |
| "Thoughts?" or "Agree?" alone | Lazy CTA, no real discussion |
| "Happy to connect!" | Filler |
| "I don't usually post about this but..." | Then don't prefix it |

## Tone

| Do | Don't |
|----|-------|
| Use "I" and personal experience | Write about yourself in third person |
| Share specific numbers and results | Vague claims ("significantly improved") |
| Acknowledge uncertainty ("In my experience...") | Speak in absolutes |
| Short paragraphs, generous whitespace | Wall of text |
| Credit others by name | Take sole credit for team wins |
| Plain words | "Synergy", "leverage", "paradigm shift" |

## Algorithm and distribution

LinkedIn does not publish its ranking weights; the following are working heuristics from public creator guidance. Check them against the account's analytics.

- Dwell time and comments carry the most weight in practice. Target 1,000 to 1,300 characters for story and insight posts.
- Put external links in the first comment, not the body.
- Use 3 to 5 hashtags at the end, or fewer.
- Reply to every comment in the first hour, especially the first five.
- Tag people sparingly (3 to 5 at most, only where relevant).
- Avoid editing within the first 10 minutes, tagging 10+ people, and reposting other platforms' watermarked content.
- Best windows are usually Tue to Thu mornings and midday in the audience's time zone. Skip weekends unless the audience is global.

### Weekly mix

| Day | Type |
|-----|------|
| Monday | Insight or observation |
| Tuesday | Story post |
| Wednesday | Carousel ([linkedin-carousel](../linkedin-carousel/SKILL.md)) |
| Thursday | Contrarian or discussion |
| Friday | Celebration or lighter post |

## Comment engagement

Comments are the strongest growth lever. Reply within the hour. Comment on 5 to 10 posts a day from your target audience before and after you post.

| Framework | Template |
|-----------|----------|
| Add insight | "[Point] is spot on. I'd add [your perspective]." |
| Share data | "The data supports this: [real stat]. What I find interesting is [take]." |
| Ask a question | "Curious: have you found this applies to [context]?" |
| Respectful disagree | "I've seen the opposite in [context] because [reason]." |
| Story | "This reminds me of [anecdote]. The lesson was [takeaway]." |

Never leave: "Great post!", "Interesting", "Agree!", emoji only, or a pitch.

## Output format

```
[Hook line]

[Body: short paragraphs, whitespace]

[Lesson or insight]

[CTA question]

[3-5 hashtags]

First comment: [link or resource, if any]
```

Offer two hooks when the user is undecided. State the character count.

## Genfeed integration

If Genfeed tools are available:

- `generate_content` with `{type: "post", platform: "linkedin", topic, brandId}` gives a starting draft to edit against this skill.
- `create_post` saves a draft with `platforms: ["linkedin"]`. It does not publish.
- Publishing goes through `social-poster`, only on explicit confirmation.

The skill works fully without Genfeed.

## Checklist

- [ ] Hook in the first line (no "I'm excited to share")
- [ ] 1,000-1,300 characters for story and insight posts
- [ ] No external link in the body (first comment instead)
- [ ] Three to five relevant hashtags at most
- [ ] A CTA that invites a real answer
- [ ] Short paragraphs with whitespace
- [ ] Every number, name and story is real and cleared to share
- [ ] Professional but human tone
- [ ] Ready to reply within the first hour
- [ ] Proofread
