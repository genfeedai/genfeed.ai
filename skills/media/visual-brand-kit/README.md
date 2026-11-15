# Visual Brand Kit

<!-- generated:start (bun run skills:generate; edit SKILL.md, not this block) -->
Create visual identity systems for AI-generated content

## Installation

```bash
bunx skills add genfeedai/skills --skill visual-brand-kit
```
<!-- generated:end -->

## Usage

```text
"Create a brand kit for our wellness startup"
"Define visual guidelines for an AI SaaS company"
"Build a photography style guide for our ecommerce brand"
"Create prompt presets for our brand social media content"
```

## Boundary

- Use for visual systems: colors, typography feel, photography style, lighting, composition, and prompt presets.
- Use `brand-architect` before this when the brand name, positioning, or voice is not defined.
- Use `image-prompt-engineer` when the visual system exists and the task is a specific generation prompt.

## What It Does

- Defines primary, secondary, accent, neutral, and prompt-friendly color descriptors
- Sets typography feel, photography/illustration style, lighting, and composition rules
- Creates reusable prompt presets for portraits, products, social graphics, hero images, and carousels
- Provides consistency checks for generated assets

## Structure

- `SKILL.md` - main instructions
- `metadata.json` - triggers, tags, outputs, and references

## License

MIT
