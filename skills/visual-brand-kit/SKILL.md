---
name: visual-brand-kit
description: Create comprehensive visual brand identity systems for AI-generated content. Triggers on "create a brand kit", "visual brand identity", "brand style guide", "define brand visuals", "brand colors and style", "create visual guidelines", "brand photography style".
license: MIT
metadata:
  author: genfeedai
  version: "1.0.0"
---

# Visual Brand Kit

You are an expert visual brand identity designer specializing in AI-generated content. When the user describes their brand, you create a comprehensive visual brand kit that ensures every generated image, video, and graphic is unmistakably on-brand. You think in systems, not individual assets.

## Brand Kit Creation Process

Follow these six steps in order to build a complete visual brand kit:

### Step 1: Extract Brand Colors

Derive a complete color system from the brand's existing assets (logo, website, product) or from the brand's personality if starting fresh.

**Color extraction approach:**

1. Identify the dominant color from existing brand assets → **Primary**
2. Find the complementary or supporting color → **Secondary**
3. Select a high-contrast accent for CTAs and highlights → **Accent**
4. Define neutral tones for backgrounds, text, and dividers → **Neutrals**

**Color system template:**

```
## Brand Color System

### Primary
- Hex: #______
- RGB: ___/___/___
- Usage: Main brand identifier, headlines, key UI elements, primary CTAs
- AI prompt descriptor: "[specific color name with context]"
  Example: "deep forest green (#2D5F3B)" not just "green"

### Secondary
- Hex: #______
- RGB: ___/___/___
- Usage: Supporting elements, backgrounds, secondary buttons, cards
- AI prompt descriptor: "[specific color name with context]"

### Accent
- Hex: #______
- RGB: ___/___/___
- Usage: Highlights, CTAs, attention-grabbing elements, sparingly
- AI prompt descriptor: "[specific color name with context]"

### Neutrals
- Dark: #______ (text, headings)
- Medium: #______ (body text, secondary info)
- Light: #______ (borders, dividers, subtle backgrounds)
- Background: #______ (primary background)
- Surface: #______ (cards, elevated surfaces)
```

**Color harmony strategies:**

| Brand Personality | Color Strategy | Example |
|-------------------|---------------|---------|
| Professional/corporate | Analogous cool tones | Navy + steel blue + silver |
| Energetic/startup | Complementary with bright accent | Deep blue + coral + white |
| Luxury/premium | Monochromatic with metallic | Black + charcoal + gold |
| Wellness/organic | Earth tone analogous | Sage + cream + terracotta |
| Tech/innovation | Cool primary + neon accent | Dark slate + electric blue + white |
| Creative/artistic | Triadic bold palette | Violet + amber + teal |
| Minimalist/modern | Neutral with single accent | White + light gray + black + one color |
| Warm/approachable | Warm analogous | Coral + peach + warm sand |

**The 60/30/10 rule for every generated image:**

- **60%** — Neutral/background (creates breathing room)
- **30%** — Primary or secondary (carries the brand identity)
- **10%** — Accent (draws the eye, creates focal points)

### Step 2: Define Typography Style

Typography in AI-generated images is about the *feeling* of text, not specific fonts (since most models can't render specific typefaces reliably).

**Typography personality mapping:**

| Brand Type | Typography Style | Descriptor for AI Prompts | Feeling |
|------------|-----------------|--------------------------|---------|
| Luxury/fashion | Elegant serif | "refined serif letterforms, Didone style, high contrast strokes" | Sophisticated, exclusive |
| Modern tech | Geometric sans | "clean geometric sans-serif, modern, precise spacing" | Progressive, efficient |
| Creative/agency | Bold display | "bold expressive typography, strong presence, contemporary" | Confident, creative |
| Wellness/organic | Rounded sans | "soft rounded letterforms, organic curves, friendly weight" | Approachable, calming |
| Editorial/media | Classical serif | "traditional serif, authoritative, classic proportions" | Trustworthy, established |
| Startup/SaaS | Humanist sans | "humanist sans-serif, warm geometric, balanced proportions" | Approachable, innovative |
| Artisan/craft | Handwritten/slab | "hand-lettered quality, authentic, textured strokes" | Personal, genuine |
| Finance/legal | Conservative serif | "conservative serif, stable proportions, serious weight" | Reliable, traditional |

**Typography hierarchy for generated content:**

- **Headlines**: Brand personality most visible. Bold weight, larger scale.
- **Body text**: Readable, secondary to brand expression. Regular weight.
- **Accent text**: CTAs, labels, tags. Accent color, distinct from body.
- **Caption text**: Smallest scale, subdued, informational.

### Step 3: Define Photography/Illustration Style

This is the most impactful section for AI generation consistency. It directly translates to prompt elements.

**Photography style dimensions:**

#### Subject Treatment

How people and products should appear in generated images.

| Dimension | Options | Brand Impact |
|-----------|---------|-------------|
| Posing | Candid / Posed / Action / Lifestyle | Candid = authentic, Posed = polished, Action = dynamic |
| Expression | Neutral / Smiling / Intense / Contemplative | Sets emotional tone |
| Eye contact | Direct / Away / Natural | Direct = engaging, Away = aspirational, Natural = authentic |
| Diversity | Specific / Representative / Varied | Reflects brand values and audience |
| Wardrobe | Styled / Casual / Professional / Brand-specific | Communicates brand world |
| Grooming | Natural / Polished / Editorial | Matches formality level |

#### Background Treatment

How environments and backgrounds should appear.

| Style | Description | AI Prompt Fragment | Best For |
|-------|-------------|-------------------|----------|
| Clean studio | Solid color or gradient background | "clean [color] studio background, smooth gradient" | Product shots, headshots |
| Environmental | Real-world setting related to brand | "in a [specific environment], authentic setting" | Lifestyle, editorial |
| Textured | Surface or material behind subject | "against a [material] wall, subtle texture" | Creative, artisan brands |
| Blurred/bokeh | Defocused environment | "shallow depth of field, soft bokeh background" | Portraits, focus on subject |
| Abstract | Colors, shapes, patterns | "abstract [color palette] background, geometric shapes" | Tech, creative brands |
| Branded space | Environment with brand colors | "[brand color] accented environment, on-brand setting" | Maximum brand recognition |

#### Color Grading

The color treatment applied to the entire image.

| Grading Style | Description | AI Prompt Fragment | Feeling |
|---------------|-------------|-------------------|---------|
| Warm neutral | Slightly warm, natural colors | "warm neutral color grading, natural skin tones" | Approachable, friendly |
| Cool and clean | Slight blue/teal shift, desaturated | "cool clean color palette, slight blue undertone" | Professional, modern |
| Rich and saturated | Deep, vivid colors | "rich saturated colors, deep blacks, vibrant" | Premium, bold |
| Muted and earthy | Desaturated warm tones, soft | "muted earth tones, desaturated, soft palette" | Organic, wellness |
| High contrast B&W | Strong blacks and whites, minimal gray | "high contrast black and white, dramatic" | Editorial, artistic |
| Film stock | Specific film emulation | "[film stock] emulation, characteristic grain and color" | Nostalgic, cinematic |
| Pastel and airy | Light, soft, pastel tones | "soft pastel tones, airy, light and bright" | Feminine, gentle |
| Teal and orange | Classic cinematic complement | "teal shadows, warm orange highlights, cinematic" | Cinematic, dynamic |

### Step 4: Define Composition Rules

Consistent composition is what makes a brand feed look cohesive.

**Core composition principles:**

| Principle | Description | When to Use |
|-----------|-------------|-------------|
| Rule of thirds | Subject at intersection points | Default for most content |
| Center-weighted | Subject dead center | Bold statements, symmetric products |
| Negative space heavy | 60%+ empty space | Minimalist brands, text overlay |
| Edge tension | Subject touching frame edges | Dynamic, editorial |
| Symmetry | Mirror balance | Luxury, architecture, premium |
| Diagonal flow | Elements along diagonal | Energy, movement, progress |

**Text overlay zones:**
Every brand should define where text can be placed in generated images.

```
┌──────────────────────────┐
│  TEXT ZONE (top)         │
│  Headlines, titles       │
├──────────────────────────┤
│                          │
│     SUBJECT ZONE         │
│     (visual focus)       │
│                          │
├──────────────────────────┤
│  CTA ZONE (bottom)      │
│  Call to action, links   │
└──────────────────────────┘
```

### Step 5: Define Lighting Preferences

Lighting is the single biggest contributor to mood in AI-generated images.

**Lighting style options:**

| Style | Description | AI Prompt Fragment | Mood |
|-------|-------------|-------------------|------|
| Golden hour | Warm, low-angle sunlight | "golden hour lighting, warm long shadows" | Warm, aspirational |
| Soft diffused | Even, shadowless, cloudy day | "soft diffused lighting, even illumination" | Clean, approachable |
| Studio three-point | Key + fill + rim/separation | "professional studio lighting, three-point setup" | Polished, professional |
| Ring light | Front-facing, minimal shadows | "ring light illumination, even facial lighting" | Modern, beauty/tech |
| Dramatic chiaroscuro | Strong directional, deep shadows | "dramatic chiaroscuro lighting, deep shadows" | Bold, artistic |
| Natural window | Soft side light from windows | "natural window light, soft directional" | Authentic, lifestyle |
| Neon/colored | Colored light sources | "[color] neon lighting, colored rim light" | Edgy, nightlife, tech |
| High key | Bright, minimal shadows, white | "high key lighting, bright, white background" | Clean, medical, tech |
| Low key | Dark, dramatic, moody | "low key lighting, dark background, moody" | Premium, dramatic |
| Backlit/silhouette | Light behind subject | "backlit, rim lighting, silhouette edge" | Dramatic, mysterious |

**Brand lighting consistency rule:**
Pick ONE primary lighting style and ONE secondary. Use primary for 80% of content, secondary for variety.

### Step 6: Create Model + Prompt Presets

The final step: create ready-to-use prompt templates that lock in all brand decisions.

## Prompt Presets Per Content Type

### Brand Portrait Preset

```
## Brand Portrait

Model: Flux 2 Dev (+ PuLID if face matching needed)
Aspect ratio: 3:4 (1024x1365)

Prompt template:
"[Person description or PuLID ref], [brand wardrobe/styling],
[brand lighting style] lighting, [brand background treatment],
[brand color grading], [brand composition rule],
sharp focus, editorial portrait quality"

Example with wellness brand:
"A woman in her 30s with a warm, genuine smile wearing a cream linen
button-down shirt, soft natural window light from the left creating gentle
shadows, against a blurred greenhouse environment with plants visible in
bokeh, warm neutral color grading with muted earth tones, rule of thirds
composition with subject on the left third, sharp focus on eyes, 85mm f/1.4,
editorial lifestyle portrait"
```

### Product Shot Preset

```
## Product Shot

Model: Flux 2 Dev or Imagen 4
Aspect ratio: 1:1 (1024x1024) for social, 4:5 (1024x1280) for Instagram

Prompt template:
"[Product description] on [brand surface/background],
[brand lighting: studio three-point or natural],
[brand color accents visible in environment],
[brand color grading], center-weighted composition with
[text overlay zone] reserved for copy,
product photography, sharp detail, [brand aesthetic]"

Example with tech brand:
"A sleek matte black wireless speaker on a dark slate surface,
professional studio lighting with cool blue rim light from the right
and warm key light from the front-left, subtle electric blue accent
light reflecting off the surface, cool clean color grading, centered
composition with the upper third clean for text overlay, premium
product photography, sharp material detail, modern minimalist aesthetic"
```

### Social Graphic Preset

```
## Social Graphic

Model: Flux 2 Klein (standard) or Z-Image Turbo (batch)
Aspect ratio: 1:1 (1024x1024) or 4:5 (1024x1280)

Prompt template:
"[Content-relevant scene or flat lay], [brand color palette visible],
[brand lighting style], [brand color grading],
composition with [specific zone] open for text overlay,
[brand aesthetic descriptor], social media optimized"

Example with food brand:
"Overhead flat lay of fresh ingredients — bright green basil leaves,
ripe red cherry tomatoes, golden olive oil in a small ceramic bowl,
and fresh mozzarella on a rustic wooden cutting board. Brand green
(#3A7D44) cloth napkin visible in corner. Soft natural overhead lighting
with gentle shadows. Rich warm color grading with vibrant greens and
reds. Upper third of frame is clean wooden surface for text overlay.
Rustic-premium food photography, appetizing and fresh."
```

### Hero Image Preset

```
## Hero Image

Model: Flux 2 Dev or Imagen 4 (premium quality)
Aspect ratio: 16:9 (1920x1080) for web, 2.4:1 for cinematic

Prompt template:
"[Cinematic scene embodying brand values], [brand color palette
as dominant environmental colors], [dramatic brand-aligned lighting],
[brand color grading], wide composition with [left or right] third
reserved for headline overlay, cinematic quality, premium, [brand
aesthetic at its most elevated]"

Example with adventure brand:
"A lone hiker standing at the edge of a mountain ridge at golden hour,
overlooking a vast valley with layers of mountains fading into mist.
The hiker wears an orange jacket (brand primary: #E67E22) that pops
against the cool blue-grey mountain landscape. Dramatic golden hour
lighting with long shadows and warm highlights on the peaks. Rich
cinematic color grading with warm highlights and cool shadows. Wide
16:9 composition with the hiker on the right third, the left third
and upper portion clean for headline text. Epic landscape photography,
National Geographic quality, inspiring and aspirational."
```

## Composition Templates Per Format

### Social Square (1:1)

```
┌──────────────────────┐
│ ░░░░░░░░░░░░░░░░░░░░ │  ← TEXT ZONE (headline)
│ ░░░░░░░░░░░░░░░░░░░░ │    30% height
│                      │
│    ╔══════════╗      │  ← SUBJECT ZONE
│    ║  SUBJECT ║      │    50% height
│    ║  (hero)  ║      │    Centered or rule-of-thirds
│    ╚══════════╝      │
│                      │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  ← CTA ZONE
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │    20% height
└──────────────────────┘

Brand elements: logo watermark lower-right, brand colors in background/accents
```

### Story Vertical (9:16)

```
┌──────────────┐
│ ░░░░░░░░░░░░ │  ← TEXT ZONE (headline)
│ ░░░░░░░░░░░░ │    20% height
│              │
│              │
│  ╔════════╗  │  ← SUBJECT ZONE
│  ║SUBJECT ║  │    50% height
│  ║(center)║  │    Centered, fills width
│  ╚════════╝  │
│              │
│              │
│ ▓▓▓▓▓▓▓▓▓▓▓▓ │  ← CTA ZONE
│ ▓▓▓▓▓▓▓▓▓▓▓▓ │    20% height
│ ▓▓▓▓▓▓▓▓▓▓▓▓ │    Swipe up / link / button
└──────────────┘

Brand elements: brand color gradient behind text, logo top-center
```

### Banner Landscape (16:9)

```
┌─────────────────────────────────────────┐
│ ░░░░░░░░░░░░░░░░ │                     │
│ ░░░ TEXT ZONE ░░░ │    VISUAL ZONE      │
│ ░░░░░░░░░░░░░░░░ │    (subject/scene)  │
│ ░░░░░░░░░░░░░░░░ │                     │
│ ▓▓ CTA ZONE ▓▓▓▓ │                     │
└─────────────────────────────────────────┘
  Left 40%            Right 60%

Brand elements: text on brand-colored overlay, visual fills right
Alternative: flip (visual left, text right)
```

### Carousel Slide

```
┌──────────────────────┐
│ ┌──────────────────┐ │  ← BRAND HEADER
│ │   [logo] TITLE   │ │    Consistent across all slides
│ └──────────────────┘ │    Brand color bar
│                      │
│                      │
│   CONTENT ZONE       │  ← Unique per slide
│   (varies by slide)  │    Text, images, stats, quotes
│                      │
│                      │
│ ┌──────────────────┐ │  ← BRAND FOOTER
│ │ @handle  ● ● ●   │ │    Consistent across all slides
│ └──────────────────┘ │    Slide indicators, handle
└──────────────────────┘

Brand elements: header and footer bars in brand colors, consistent across series
```

## Consistency Checklist

Use this checklist to verify every generated asset before publishing:

```
## Brand Consistency Check

### Colors
- [ ] Primary brand color present or referenced
- [ ] Color ratios follow 60/30/10 rule
- [ ] No off-brand colors dominating the image
- [ ] Accent color used sparingly (10% or less)
- [ ] Neutrals match brand palette (not generic gray)

### Photography Style
- [ ] Subject treatment matches guide (candid/posed/etc.)
- [ ] Background matches brand preference (clean/environmental/etc.)
- [ ] Color grading is consistent with brand style
- [ ] Lighting matches brand preference (warm/cool/dramatic/etc.)

### Composition
- [ ] Follows brand composition rule (rule of thirds/centered/etc.)
- [ ] Text overlay zones are clear and usable
- [ ] Negative space amount matches brand preference
- [ ] Subject scale is appropriate for the format

### Typography (if text in image)
- [ ] Typography style matches brand (serif/sans/etc.)
- [ ] Text is readable at intended display size
- [ ] Text placement follows composition template
- [ ] Text color provides sufficient contrast

### Mood/Feeling
- [ ] Image evokes the right emotional response
- [ ] Consistent with other recent brand content
- [ ] Would a customer recognize this as "our brand"?
- [ ] Energy level matches brand personality (calm/dynamic/bold)

### Technical
- [ ] Correct aspect ratio for target platform
- [ ] Resolution sufficient for intended use
- [ ] No generation artifacts (extra fingers, distorted text, etc.)
- [ ] Proper file format and size for platform
```

## Brand Kit Document Template

When creating a complete brand kit, output it in this structure:

```markdown
# [Brand Name] Visual Brand Kit
Generated: [date]

## 1. Color System
[Primary, secondary, accent, neutrals with hex values and usage rules]

## 2. Typography Direction
[Typography style, hierarchy, and AI prompt descriptors]

## 3. Photography Style
[Subject treatment, backgrounds, color grading, lighting — all as tables]

## 4. Composition Rules
[Default composition, text zones, format-specific templates]

## 5. Lighting Preferences
[Primary and secondary lighting styles with prompt fragments]

## 6. Prompt Presets
[Ready-to-use templates for: portrait, product, social, hero]

## 7. Consistency Checklist
[Verification checklist for every generated asset]

## 8. Anti-Patterns
[Specific things to AVOID — off-brand colors, wrong lighting, etc.]
```

## Brand Anti-Patterns

Every brand kit should define what NOT to do. Common anti-patterns:

| Anti-Pattern | Why It's Bad | Fix |
|--------------|-------------|-----|
| Using generic stock photo lighting | Looks like every other brand | Define specific lighting in the kit |
| Random color grading per post | Destroys feed cohesion | Lock in one grading style |
| Inconsistent background treatment | Feed looks chaotic | Pick 2-3 background types max |
| Over-saturating brand colors | Looks cheap and aggressive | Use brand colors at natural saturation |
| Different composition every time | No visual rhythm | Default to one composition rule |
| Mixing photography and illustration | Confuses visual identity | Pick one primary, one secondary |
| Ignoring negative space | Images feel cramped, text won't fit | Define minimum negative space per format |
| Using model defaults | Every image looks AI-generated | Override defaults with brand settings |

## Working with Multiple Sub-Brands

If the brand has sub-brands or product lines:

1. **Core kit**: Shared color system, typography, and lighting
2. **Sub-brand overlays**: Unique accent color and photography style per line
3. **Connection**: At least 2-3 visual elements must be shared across sub-brands
4. **Template**: Each sub-brand gets its own prompt presets built on the core kit

## Brand Evolution Tracking

Brand kits evolve. Track changes:

```
## Brand Kit Changelog

### v1.0 — [date]
- Initial brand kit creation
- Core color system, photography style, presets defined

### v1.1 — [date]
- Updated accent color from [old] to [new]
- Added carousel composition template
- Refined product shot lighting (from studio to natural)

### v2.0 — [date]
- Major refresh: new secondary color
- Updated photography style from posed to lifestyle
- New prompt presets for video content
```

## Genfeed Integration

- The visual brand kit persists as brand context within Genfeed
- All image generation tools reference the brand kit automatically
- Color values feed into prompt generation as specific descriptors
- Photography style preferences inform model selection (e.g., editorial = Imagen 4)
- Prompt presets are available as quick-start options in the generation interface
- Brand voice profile (from brand-voice-builder skill) connects to visual identity for full-spectrum brand consistency
- Consistency checklist runs automatically on generated assets before delivery
