# Brand OS Source Pack

Use this reference when creating source-backed Brand OS systems. These sources are public references and principles. Do not copy any brand's private kit, exact identity, mascot, UI, palette, or typography.

## Paul Graham: The Brand Age

Source: https://www.paulgraham.com/brandage.html

Useful principle: when product capability commoditizes or becomes hard to evaluate directly, brand becomes a larger part of perceived value, trust, and market memory.

Apply it this way:

- Treat brand as a trust and status system, not as decoration.
- Build a brand that helps buyers choose when feature comparison is noisy.
- Preserve product proof: brand cannot compensate for weak product experience.
- Turn positioning into repeated signals across site, UI, content, launch assets, and support.

## a16z: New Media And Launch Storytelling

Sources:

- https://a16z.com/what-is-new-media/
- https://a16z.com/what-is-new-media-in-2026/

Useful principle: startups can now own distribution by creating their own media moments. Launch videos and founder-led media work because they combine story, emotion, proof, and brand feel in a shareable artifact.

Apply it this way:

- Build launch assets as narrative systems, not announcement posts.
- Include stakes, antagonist, transformation, product proof, and emotional texture.
- Give the Brand OS rules for video, founder posts, screenshots, demos, and launch pages.
- Measure attention-to-action, not only impressions.

## Wada Sanzo And Japanese Color Harmony

Sources:

- https://en.seigensha.com/books/978-4-86152-247-5/
- https://www.wada-sanzo-colors.com/

Useful principle: color systems can gain depth from named, historically grounded harmonies. Wada Sanzo's color-combination work is useful because it treats palettes as relationships, not isolated hex values.

Apply it this way:

- Start from a reference color and define supporting roles.
- Name colors semantically and culturally only when accurate.
- Store color roles: canvas, surface, text, accent, warning, proof, campaign, image grade.
- Avoid defaulting every brand to Japanese color names; use them when they improve clarity and taste.

Validation rule:

- A palette is Wada/Sanzo-matched only when each matched role records the Wada color name, collection, combination id when relevant, source URL, HEX, RGB, LAB when available, and whether the match is exact or nearest.
- A palette is Wada/Sanzo-informed when it uses Wada's color-relationship method without claiming exact source swatches.
- Do not rename product tokens with Japanese or Wada color names unless the exact or nearest mapping is documented.
- Use nearest-color matching as diagnostics only. Never claim an exact match when the codebase token and source swatch differ.
- Keep accessibility and product semantics ahead of historic color matching: contrast, state meaning, and readable hierarchy still win.

## Relative Object Scale

Useful principle: a Brand OS should define how large objects feel in relation to each other. Agents should receive semantic scale roles instead of vague instructions like "bigger" or "smaller."

Apply it this way:

- Keep dense product UI on an ergonomic grid, such as 4px or 8px.
- Use a rounded golden-ratio progression for campaign, launch, and brand objects when the brand needs harmony and drama.
- Name scale roles by usage, such as micro, chip, control, block, hero, monument, and god.
- Treat "god" scale as a rare campaign-only focal object, not an everyday UI size.
- Define each role with dimensions, type behavior, motion budget, and usage constraints.
- Round exact ratios to implementation-friendly values so the system can be used in CSS, design tools, and image prompts.

## Cute Studies And Kawaii

Sources:

- https://www.cutestudies.org/
- https://www.cutestudies.com/
- https://japanpastandpresent.org/en/teaching-aids/reading-lists/core-readings-in-kawaii-studies-an-annotated-guide

Useful principle: cuteness can create approachability, attachment, shareability, and status. It is not automatically frivolous, but it can become unserious if used without audience fit.

Apply it this way:

- Use cute, mascot, or character systems when they reduce anxiety or create attachment.
- Define character states, boundaries, and usage contexts.
- Keep enterprise and high-trust product surfaces clear, useful, and non-distracting.
- Use mascot/status mechanics as optional identity layers, not mandatory decoration.

## Implementation Reference Boundary

Use source material for principles, not competitor implementations for templates.

Apply it this way:

- Prefer primary essays, books, academic references, and direct product evidence from the user's own brand.
- Do not use another startup's exact implementation as a Brand OS source.
- Do not copy a competitor's font choices, palette, mascot, UI metaphors, launch mechanics, or private brand kit.
- If competitor examples are supplied by the user, treat them as market context or anti-copy constraints, not as source-of-truth references.
- For Genfeed, prioritize content operations, brand memory, autonomous generation, source evidence, and trust.

## Brand OS Generator Implications

A Brand OS generator should output:

- Evidence and confidence, not only recommendations.
- Visual identity and verbal identity.
- Content pillars and launch storytelling.
- AI-readable context and negative rules.
- Review checklists and readiness states.
- CTA and conversion path.
- Source references for non-obvious recommendations.

It should not output:

- Unsupported factual claims.
- Competitor-cloned style.
- Unlicensed assets.
- A full rebrand when the user asked for extraction.
- A static PDF with no machine-readable generation context.
