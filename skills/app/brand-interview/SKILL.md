---
name: brand-interview
description: 'Interview an operator to extract their brand voice, audience, and content strategy, then write the answers into the brand profile. Pushes back on vague answers instead of accepting them. Triggers on "interview me", "grill me", "brand interview", "help me define my voice", "what is my brand voice", "fill in my brand profile", "onboard my brand", "my brand profile is empty".'
license: MIT
metadata:
  author: genfeedai
  version: 1.0.0
  tags: brand, voice, interview, onboarding, strategy, context
---

# Brand Interview

Run an interview that ends with a brand profile good enough to generate from. You are not filling a form — you are getting a specific, usable answer out of someone who will default to generic ones.

Use this when the operator asks to be interviewed or grilled, when their brand voice is undefined, or when generated content keeps coming out generic because the profile behind it is empty.

## Tools

The interview is backed by real tools. Use them; do not simulate the flow in prose.

- `get_brand_completeness` — read the current score and which fields are missing. Call this first.
- `start_brand_interview` — begin the session and get the first question.
- `submit_brand_interview_answer` — persist an accepted answer to its field.
- `skip_brand_interview_question` — record a deliberate skip.

The question catalog is server-owned and ordered identity → voice → strategy. Ask the question you are given. Do not invent your own ordering or field names.

## Before You Start

Read the completeness score first and say what you found in one line: what is already filled, what is missing, roughly how long this will take. If the score is already high, offer to re-do only the weak fields rather than the whole catalog.

Never re-ask a question whose field already holds a good answer. Confirm it instead: "You currently say your audience is X — still right?"

## The Interview Loop

For each question:

1. Ask it in the operator's language, not the catalog's. Add one concrete example of a good answer if the question is abstract.
2. Read the answer against the bar below.
3. If it passes, submit it and move on with a short acknowledgement.
4. If it fails, push back **once** with a specific follow-up. Take the second answer whatever it is — two rounds per question, never more.

Ask one question at a time. A wall of questions gets a wall of shallow answers.

## The Bar

Push back when an answer is:

- **Generic.** "Professional but friendly" describes almost every brand. Ask what they say that a competitor would not.
- **A category, not a person.** "Small businesses" is not an audience. Ask who specifically — the role, the situation, what they were doing five minutes before they found this brand.
- **Aspirational with no evidence.** "We're the leader in X" — ask what makes that true, and whether they would put it in a post.
- **Borrowed.** Copy that sounds like a competitor's About page. Ask for a sentence they have actually written and liked.
- **Empty of specifics.** No numbers, no names, no examples. Ask for one.

Accept an answer that is short but specific. "Cranky and technical, no exclamation marks" is a better voice answer than three polished sentences that say nothing.

## How to Push Back

Be direct and brief. One sentence of pushback, one specific question.

> "Friendly and professional" fits about every B2B brand on the internet. What's something you'd say that a competitor wouldn't put in writing?

> You said "founders". Which founders — first-time or third-time, funded or bootstrapped, and what problem are they up at midnight with?

Do not lecture, do not list frameworks, and do not apologise for asking again. If the operator pushes back on your pushback, take their answer and move on: it is their brand.

## Voice Questions Need Samples

The voice fields (`tone`, `style`, `sampleOutput`, `doNotSoundLike`) are what actually steer generation, so they carry the most weight. For those:

- Ask for a real sample — a post, an email, a slack message they wrote — rather than a description of their voice. People describe their voice inaccurately and demonstrate it perfectly.
- If they give a sample, name the two or three patterns you see in it and confirm them: sentence length, punctuation habits, what they never do.
- Always get `doNotSoundLike`. Negative constraints are the highest-signal field in the whole catalog and people answer them instantly.

## Finishing

When the catalog is done or the operator stops:

1. Play back the profile as a short brief, grouped identity / voice / strategy.
2. Name the fields that are still weak or skipped, and what content will suffer because of it.
3. Offer one concrete next step — generate a post with the new profile so they can see whether it sounds like them.

Do not end with a summary of how the interview went. End with the profile and the next action.
