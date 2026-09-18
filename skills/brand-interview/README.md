# Brand Interview

Interviews an operator to extract their brand voice, audience, and content strategy, and writes the answers straight into the brand profile that every generation reads from. Pushes back once on vague, generic, or borrowed answers instead of filing them.

## Installation

```bash
npx skills add genfeedai/skills/brand-interview
```

## Usage

```
"Interview me"
"Grill me on my brand voice"
"My content keeps coming out generic — fix my brand profile"
"Help me define who I'm actually writing for"
"Fill in whatever's missing from my brand"
```

## What it does

- Reads the current brand completeness score before asking anything, and skips fields that already hold a good answer
- Walks the server-owned question catalog in order: identity → voice → strategy
- Pushes back once per question when an answer is generic, a category rather than a person, aspirational without evidence, or borrowed from a competitor
- Asks for real writing samples on the voice fields, because people describe their voice inaccurately and demonstrate it perfectly
- Always captures `doNotSoundLike` — negative constraints are the highest-signal field in the catalog
- Ends with the profile played back as a brief, the weak fields named, and one concrete next step

## Notes

The interview is backed by real tools (`get_brand_completeness`, `start_brand_interview`, `submit_brand_interview_answer`, `skip_brand_interview_question`) and persists to the brand's `voice` and `strategy` config, not to chat history. The question catalog and its field mapping are owned by the server.
