# Genfeed Brand Showcase Render

A phased image-generation prompt that renders the Genfeed Brand OS as one bento-grid showcase. It presents the identity defined in `brand-os.md`; it never defines it. Run it to compare candidates for the open questions in that file, or to spec the visual preview the Brand OS generator shows users.

Method reference: the public "extract first, then render eight cards" moodboard pattern (see `skills/brand-os-architect/references/source-pack.md`, Phased Brand Showcase Renders). The phase order and the completeness checklist are borrowed. The card content, art direction, palette, and typography are Genfeed's own.

## Phase 1: Extract

Fill every slot from repo evidence before rendering. Every row carries a `Label`: `exact` (a token or approved asset), `derived` (from a rule in `brand-os.md` or `DESIGN.md`), or `candidate` (exploration for an open question). The `Source` column is the evidence receipt: the file and section, or the reference asset, the value was read from. Never render a slot without a label, and never render a `candidate` without a `candidate` marker in the run name.

The label is metadata, not image text. It is never rendered inside the picture. It travels with the run as a sidecar: the file name carries `exact` or `candidate-<slot>`, and the caption or preview data lists every slot with its label and source. The Brand OS generator shows those labels beside each preview card.

| Slot | Label | Source | Value |
| --- | --- | --- | --- |
| Name and category line | exact | `brand-os.md` Positioning | Genfeed.ai, the open-source AI OS for content creation |
| Canvas | exact | `DESIGN.md` colors, background-100 | `#0A0A0A` |
| Neutral ladder (ten steps) | exact | `DESIGN.md` colors, gray-100 to gray-1000 | `#161616`, `#1F1F1F`, `#2A2A2A`, `#333333`, `#4A4A4A`, `#666666`, `#808080`, `#949494`, `#A1A1A1`, `#EDEDED` |
| Card and nested surfaces | exact | `DESIGN.md` colors, bg-secondary and bg-tertiary | `#161616` card, `#1F1F1F` nested |
| Text tiers | exact | `DESIGN.md` colors, text-primary to text-muted | `#EDEDED`, `#A1A1A1`, `#949494` |
| Status hues | exact | `DESIGN.md` colors, semantic status and domain | success `#10B981`, warning `#F59E0B`, danger `#FF6166`, info `#52A8FF`, agent `#38BDF8`, done `#C084FC` |
| Product typeface | exact | `DESIGN.md` typography | Satoshi, weights 400 to 600, tight tracking |
| Editorial typeface | exact | `DESIGN.md` typography, editorial role | Zodiak serif, 400 |
| Rim light pair | derived | article-card editorial system | blue on one side, restrained coral on the other |
| Mark | exact | authentic Genfeed G reference image | exact silhouette, never redrawn |
| Founder or mascot presence | derived, or candidate when exploring the mascot question | article-card editorial system | default: Vincent, naturally coloured, optional per card; a mascot render is a `candidate` |
| Campaign palette | exact by default, candidate when exploring | `brand-os.md` Visual System | default: the status hues above only; a Wada-informed campaign mode is a `candidate` |
| Headline | exact | `brand-os.md` sample headlines | one line from that list, two to five words, no terminal punctuation; default `Build your Brand OS` |
| CTA | exact | `brand-os.md` CTA hierarchy | Build your Brand OS |
| State vocabulary | derived | `brand-os.md` Principle 4 | draft, review, accepted, scheduled, published, learning |

Before rendering, substitute the chosen headline for `<HEADLINE>` in the prompt below. A prompt that still contains `<HEADLINE>` or any other angle-bracket placeholder must not be sent.

## Phase 2: Render

```text
Use case: ads-marketing
Asset type: 16:9 brand identity showcase, 1920 x 1080, single image
Primary request: Render the Genfeed.ai Brand OS as one asymmetric bento grid of eight rectangular cards on a #0A0A0A canvas with 24px gutters. Cards are matte #161616 slabs with hairline #333333 edges. The grid reads as a photographed physical exhibition, not a UI mockup.
Input images: Image 1 is the authentic Genfeed G mark; Image 2 is the approved dark editorial studio reference; Image 3 (optional) is Vincent's identity reference.

Cards:
1. Key visual (largest, top-left, 2x2): one monumental fabricated Genfeed G in slate and brushed steel on a matte charcoal studio floor, blue rim light left, restrained coral rim light right.
2. Logo lockup: the exact G mark beside the wordmark "Genfeed" in Satoshi 600, shown once on #0A0A0A and once inverted on #EDEDED.
3. Palette: physical enamel chips on a slate tray, labelled in small mono, exactly these and no others: canvas #0A0A0A; the ten neutral steps #161616, #1F1F1F, #2A2A2A, #333333, #4A4A4A, #666666, #808080, #949494, #A1A1A1, #EDEDED; then success #10B981, warning #F59E0B, danger #FF6166, info #52A8FF, agent #38BDF8, done #C084FC.
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
- A headline gains punctuation, a subtitle, or small copy, or the literal text `<HEADLINE>` appears anywhere.
- The palette card shows a swatch or hex label that is not in the extract table.
- The grid reads as generic AI agency artwork rather than a photographed physical exhibition.
- A `candidate` slot renders without being marked as exploration in the file name or caption.

## Uses

**Open-question exploration.** Duplicate the extract table, swap one `candidate` slot per run (founder-or-mascot presence, or campaign palette), keep every other slot `exact`, and compare renders side by side. Exploration renders never change product tokens. A candidate becomes a token only after the contrast and state review in `DESIGN.md`.

**Brand OS generator preview.** The eight cards are the completeness checklist for the visual preview in the public Brand OS generator. Each card carries its evidence source and confidence label from Phase 1, so a user sees which parts of their preview are extracted and which are proposed. Do not ship a preview that renders proposals as extracted facts.
