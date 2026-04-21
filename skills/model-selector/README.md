# Model Selector

Expert AI model advisor for image, video, and audio generation. Analyzes your task requirements and recommends the best model with rationale, speed, and cost considerations.

## Installation

```bash
npx skills add genfeedai/skills/model-selector
```

## Usage

```
Which model should I use for generating consistent portraits of our brand ambassador?
```

```
Best model for quick social media graphics?
```

```
Compare models for product photography
```

```
Recommend a model for a 10-second product demo video
```

```
Cheapest model for batch generating 50 blog header images?
```

## What It Does

- **Image model matrix**: Flux 2 Dev, Z-Image Turbo, Flux 2 Klein, DALL-E 3, Imagen 4, PuLID, LoRA variants — matched to your needs
- **Video model matrix**: Kling AI, Veo 3, Runway Gen-3, Kling Quick — compared by quality, duration, and cost
- **Music/audio models**: Coverage of audio generation options
- **Multi-model workflows**: When and how to chain models (generate, upscale, face-fix, composite)
- **Cost/speed tiers**: Budget, Standard, and Premium tier recommendations
- **Batch strategy**: Fast models for drafts, premium for finals
- **Platform-aware**: Social posts (fast/cheap), hero content (quality/slow), ads (test fast, finalize quality)
- **Genfeed integration**: References MODEL_OUTPUT_CAPABILITIES and available ModelKey values

## License

MIT
