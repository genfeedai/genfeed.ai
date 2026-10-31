---
name: brand-os-architect
description: 'Create source-backed Brand OS systems for AI-era brands, including positioning, voice, visual rules, content pillars, launch storytelling, CTA strategy, evidence, and generation checklists. Triggers on Brand OS, brand system, brand operating system, AI-readable brand book, brand kit generator, launch storytelling, Japanese color references, cute studies, and source-backed brand strategy.'
license: MIT
metadata:
  author: genfeedai
  version: 1.0.0
  tags: brand, brand-os, positioning, visual-identity, content-strategy, launch-storytelling
---

# Brand OS Architect

Build a Brand OS, not a decorative brand kit. A Brand OS is an AI-readable operating layer that tells humans and agents how a brand should think, speak, look, launch, generate, review, and improve.

Use this skill when the user wants to create, audit, or turn a brand into a reusable system for content creation, product UI, campaigns, agents, and generation workflows.

## Source Discipline

When the user asks for a source-backed Brand OS, read `references/source-pack.md` before producing the final strategy. Use the references for principles and rationale, not for copying another brand's private system, exact visual identity, mascot, palette, typography, or proprietary assets.

If the user provides a website, product docs, screenshots, codebase, or existing assets:

1. Extract observable brand evidence first.
2. Separate evidence from recommendations.
3. Label unsupported assumptions.
4. Preserve existing brand truth unless the user asks for a rebrand.
5. Cite public references by URL when using them as rationale.

## Brand OS Contract

Produce this structure unless the user asks for a narrower artifact:

```markdown
# Brand OS: {brand}

## Evidence
- Source URLs, files, screenshots, product docs, or assets used
- Existing claims, words, visual tokens, product behaviors, and audience signals
- Confidence and gaps

## Positioning
- Category
- Primary audience
- Enemy or rejected alternative
- Core promise
- Differentiator
- Positioning statement

## Brand Principles
- 3-5 rules that guide product, content, and visual decisions
- Each principle includes: rule, rationale, do, don't

## Voice System
- Personality
- Tone spectrum
- Vocabulary
- Phrases to use
- Phrases to avoid
- Sample copy

## Content System
- Content pillars
- Recurring formats
- Proof assets
- Launch storytelling patterns
- CTA hierarchy
- Review checklist

## Visual System
- Color roles and rationale
- Typography direction, not just font names
- Layout and density rules
- Scale tokens
- Semantic size roles, such as block, hero, and one-per-page campaign scale
- Motion rules
- Image/video prompt rules

## AI Context
- Compact prompt block for agents
- Generation checklist
- Quality gates
- Negative instructions

## Activation
- Website CTA
- Freebie or lead magnet
- SaaS conversion path
- First 3 campaigns or assets to build
```

## Reference-Informed Rules

- Treat brand as a compounding trust system, not a logo exercise.
- Make launch assets story-first: show stakes, transformation, and artifact value.
- Use visual systems as durable memory for agents: color roles, type roles, scale, motion, and negative rules.
- Define relative object sizes with semantic roles and ratios, not only pixel values.
- Prefer distinctive constraints over generic "premium/minimal" language.
- Use Japanese color references for harmony and naming depth when they fit the brand, not as a default aesthetic.
- Use mascot, cuteness, or maximalism only when it serves audience psychology and business context.
- Build review checklists so generated output can be scored, corrected, and learned from.

## Output Quality Gate

Before finalizing:

- Every recommendation is tied to evidence, source-backed principle, or explicit assumption.
- The Brand OS includes both human-readable guidance and compact AI context.
- Visual rules define usage and hierarchy, not only a list of colors.
- Scale rules define role, ratio, and usage context, not only a list of sizes.
- The CTA/funnel recommendation maps to a concrete conversion behavior.
- Competitor references are marked as references only and are not copied.
