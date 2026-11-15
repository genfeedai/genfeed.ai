# Image Prompt Engineer

<!-- generated:start (bun run skills:generate; edit SKILL.md, not this block) -->
Craft optimized prompts for AI image and short video generation

## Installation

```bash
bunx skills add genfeedai/skills --skill image-prompt-engineer
```
<!-- generated:end -->

## Usage

```text
"Write an image prompt for a SaaS product hero image"
"Create a video prompt for a person walking through neon-lit Tokyo streets"
"Optimize this prompt for Midjourney: a person in an office"
"Generate image prompts for an Instagram carousel about morning routines"
```

## Boundary

- Use for prompt engineering and visual prompt structure across image and short video generation.
- Use `visual-brand-kit` when the brand visual system, color rules, photography style, or prompt presets need to be defined first.
- Use `cinematic-prompting` when a prompt needs precise camera, framing, lighting, or editing vocabulary.
- Use `prompt-generator` when the output should be a structured JSON prompt with style settings and a recommended model.

## What It Does

- Structures prompts by subject, action, environment, lighting, style, technical details, and negative concepts
- Optimizes for Flux, DALL-E, Midjourney, Imagen, Stable Diffusion, PuLID, LoRA, and short video models
- Produces platform-aware prompts for posts, blog headers, ad creatives, YouTube thumbnails, carousels, and profile images
- Includes aspect ratio, negative prompt, motion, camera, and brand consistency guidance

## Structure

- `SKILL.md` - main instructions
- `metadata.json` - triggers, tags, outputs, and references

## License

MIT
