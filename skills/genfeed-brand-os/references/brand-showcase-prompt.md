# Genfeed Brand Showcase Render

A phased image-generation prompt that renders the Genfeed Brand OS as one bento-grid showcase. It presents the identity defined in `brand-os.md`; it never defines it. Run it to compare candidates for the open questions in that file, or to spec the visual preview the Brand OS generator shows users.

Method reference: the public "extract first, then render eight cards" moodboard pattern (see `skills/brand-os-architect/references/source-pack.md`, Phased Brand Showcase Renders). The phase order and the completeness checklist are borrowed. The card content, art direction, palette, and typography are Genfeed's own.

## Phase 1: Extract

Fill every slot from repo evidence before rendering. Label each value `exact` (token or approved asset), `derived` (from a rule in `brand-os.md` or `DESIGN.md`), or `candidate` (exploration for an open question). Never render a slot you cannot label.

| Slot | Source | Value |
| --- | --- | --- |
| Name and category line | `brand-os.md` Positioning | Genfeed.ai, the open-source AI OS for content creation |
| Canvas and card surfaces | `DESIGN.md` colors | `#0A0A0A` page, `#161616` card, `#1F1F1F` nested |
| Text tiers | `DESIGN.md` colors | `#EDEDED`, `#A1A1A1`, `#949494` |
| Status hues | `DESIGN.md` colors | success `#10B981`, warning `#F59E0B`, danger `#FF6166`, info `#52A8FF`, agent `#38BDF8`, done `#C084FC` |
| Product typeface | `DESIGN.md` typography | Satoshi, weights 400 to 600, tight tracking |
| Editorial typeface | `DESIGN.md` typography | Zodiak serif, 400 |
| Rim light pair | article-card editorial system | blue on one side, restrained coral on the other |
| Mark | authentic Genfeed G reference image | exact silhouette, never redrawn |
| Founder presence | article-card editorial system | Vincent, naturally coloured, optional per card |
| Headline | `brand-os.md` sample headlines | one line, two to five words, no terminal punctuation |
| CTA | `brand-os.md` CTA hierarchy | Build your Brand OS |
| State vocabulary | `brand-os.md` Principle 4 | draft, review, accepted, scheduled, published, learning |

## Phase 2: Render

```text
Use case: ads-marketing
Asset type: 16:9 brand identity showcase, 1920 x 1080, single image
Primary request: Render the Genfeed.ai Brand OS as one asymmetric bento grid of eight rectangular cards on a #0A0A0A canvas with 24px gutters. Cards are matte #161616 slabs with hairline #333333 edges. The grid reads as a photographed physical exhibition, not a UI mockup.
Input images: Image 1 is the authentic Genfeed G mark; Image 2 is the approved dark editorial studio reference; Image 3 (optional) is Vincent's identity reference.

Cards:
1. Key visual (largest, top-left, 2x2): one monumental fabricated Genfeed G in slate and brushed steel on a matte charcoal studio floor, blue rim light left, restrained coral rim light right.
2. Logo lockup: the exact G mark beside the wordmark "Genfeed" in Satoshi 600, shown once on #0A0A0A and once inverted on #EDEDED.
3. Palette: physical enamel chips on a slate tray, labelled in small mono: the ten-step neutral ladder from #0A0A0A to #EDEDED, then success #10B981, warning #F59E0B, danger #FF6166, info #52A8FF, agent #38BDF8, done #C084FC.
4. Typography: the line "Build your Brand OS" set large in Satoshi 600 above one editorial line in Zodiak serif, warm ivory on charcoal; nothing else on the card.
5. Editorial photo: an operator at a studio workbench arranging solid material tiles, natural skin tones, warm key light, cool blue fill.
6. Product artifact: a flat #161616 slab with an empty centred 16:10 recess. Leave it empty. A real product screenshot is composited after generation.
7. Social story (9:16 card): six small painted timber tiles in a row reading draft, review, accepted, scheduled, published, learning, each with a matching status-coloured edge.
8. Typographic poster: "<HEADLINE>" in enormous warm-ivory Zodiak serif, exactly once, on near-black.

Style/medium: real high-end editorial studio photography of fabricated physical objects; grayscale chrome; colour only from status chips, rim light, and media.
Text (verbatim, and only this text): "Genfeed", "Build your Brand OS", "<HEADLINE>", the six state words, the hex labels.
Constraints: exact G silhouette; no fake UI, dashboards, browser frames, charts, platform logos, mascots, robots, brains, neon gradients, glass morphism, paper, ribbons, or watermark; no typeface other than Satoshi, Zodiak, and a small mono for labels; no punctuation after headlines; no duplicate person.
```

## Reject the result when

- The G silhouette drifts or is redrawn.
- Any card shows invented product UI. Card 6 must stay empty until a real screenshot is composited.
- Chrome picks up chroma. Colour belongs to chips, rim light, and media only.
- A headline gains punctuation, a subtitle, or small copy.
- The grid reads as generic AI agency artwork rather than a photographed physical exhibition.
- A `candidate` slot renders without being marked as exploration in the file name or caption.

## Uses

**Open-question exploration.** Duplicate the extract table, swap one `candidate` slot per run (editorial typeface, campaign palette, founder presence), keep every other slot `exact`, and compare renders side by side. Exploration renders never change product tokens. A candidate becomes a token only after the contrast and state review in `DESIGN.md`.

**Brand OS generator preview.** The eight cards are the completeness checklist for the visual preview in the public Brand OS generator. Each card carries its evidence source and confidence label from Phase 1, so a user sees which parts of their preview are extracted and which are proposed. Do not ship a preview that renders proposals as extracted facts.
