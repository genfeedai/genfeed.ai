# Prompt Generator

Generate optimized prompts for AI image and video generation.

## Installation

```bash
npx skills add genfeedai/skills/prompt-generator
```

## Usage

Describe what you want to generate:

```
Generate a prompt for a luxury watch product shot
```

```
Write me a prompt for a cinematic portrait at golden hour
```

```
Create a video prompt for a person walking through neon-lit Tokyo streets
```

```
Optimize this prompt: "a cat sitting on a couch"
```

## What It Does

This skill generates detailed, well-structured prompts optimized for:

- **nano-banana models** (image generation)
- **veo-3.1 models** (video generation)

It applies:

- **Visual hierarchy**: Subject > Action > Environment > Lighting > Style > Technical
- **Concrete descriptors**: Measurable, visual language instead of vague terms
- **Style presets**: Mood, style, camera, lighting, and scene settings
- **Category-specific guidance**: Optimized for 10 content categories

## Style Settings Reference

### Mood Presets

| Preset | Description |
|--------|-------------|
| `cinematic` | High contrast, film-like color grading |
| `dreamy` | Soft focus, pastel colors, lens flare |
| `gritty` | Desaturated, high texture, harsh light |
| `ethereal` | Glowing edges, soft whites |
| `nostalgic` | Warm tones, film grain |
| `futuristic` | Cool blues, chrome, holographic |
| `mysterious` | Deep shadows, selective lighting |
| `peaceful` | Soft pastels, even lighting |
| `energetic` | High saturation, motion blur |
| `moody` | Dramatic shadows, limited palette |
| `dramatic` | Extreme contrast, bold colors |
| `whimsical` | Bright colors, magical feel |

### Style Presets

| Preset | Description |
|--------|-------------|
| `photorealistic` | Natural, accurate textures |
| `anime` | Cel shading, vibrant colors |
| `3d-render` | Clean geometry, CGI look |
| `oil-painting` | Visible brushstrokes, classical |
| `watercolor` | Transparent washes, organic |
| `digital-art` | Clean lines, modern |
| `comic-book` | Bold outlines, halftone |
| `sketch` | Line work, hatching |
| `pixel-art` | 8-bit/16-bit aesthetic |
| `minimalist` | Simple shapes, clean |
| `cyberpunk` | Neon, urban decay |
| `fantasy` | Magical, mythical |
| `retro` | 70s-90s aesthetic |
| `vintage` | Sepia, aged textures |

### Camera Presets

| Preset | Best For |
|--------|----------|
| `wide-angle` | Landscapes, architecture |
| `macro` | Products, textures |
| `telephoto` | Portraits, wildlife |
| `drone` | Aerial shots |
| `portrait` | Headshots, fashion |
| `fisheye` | Action, creative effects |
| `tilt-shift` | Miniature effect |
| `gopro` | Action, POV |
| `close-up` | Details, products |
| `low-angle` | Power, drama |
| `high-angle` | Overview, vulnerability |
| `dutch-angle` | Tension, unease |

### Lighting Presets

| Preset | Mood |
|--------|------|
| `golden-hour` | Warm, romantic |
| `studio` | Clean, professional |
| `neon` | Urban, cyberpunk |
| `natural` | Authentic |
| `dramatic` | Intense, theatrical |
| `soft` | Gentle, flattering |
| `backlit` | Ethereal, dramatic |
| `rim-light` | Definition |
| `high-key` | Bright, optimistic |
| `low-key` | Mysterious |
| `cinematic` | Film-like |

### Scene Presets

| Preset | Environment |
|--------|-------------|
| `indoor` | Interior spaces |
| `outdoor` | Exterior spaces |
| `urban` | City environments |
| `nature` | Natural landscapes |
| `studio` | Controlled backdrop |
| `underwater` | Aquatic |
| `space` | Cosmic |
| `abstract` | Non-representational |
| `industrial` | Factories, warehouses |
| `beach` | Coastal |
| `forest` | Wooded areas |
| `city-skyline` | Urban panorama |

## Categories

| Category | Description |
|----------|-------------|
| `ads` | Ads & Marketing |
| `anime` | Anime & Manga |
| `product` | Product Photography |
| `portrait` | Portraits |
| `landscape` | Landscapes |
| `abstract` | Abstract Art |
| `fashion` | Fashion |
| `food` | Food & Culinary |
| `architecture` | Architecture |
| `custom` | Custom requests |

## Example Output

### Image Prompt

**Input**: "Generate a prompt for a luxury watch product shot"

**Output**:

```json
{
  "prompt": "Luxury chronograph watch with brushed titanium case, sapphire crystal face reflecting studio lights, black leather strap with contrast stitching, resting on dark slate surface, dramatic side lighting creating defined shadows, commercial product photography, macro detail on dial complications, 8K resolution, sharp focus",
  "styleSettings": {
    "mood": "dramatic",
    "style": "photorealistic",
    "camera": "macro",
    "lighting": "studio",
    "scene": "studio"
  },
  "category": "product",
  "recommendedModel": "nano-banana-pro",
  "aspectRatio": "1:1",
  "mediaType": "image"
}
```

### Video Prompt

**Input**: "Create a video prompt for a person walking through neon-lit Tokyo streets at night"

**Output**:

```json
{
  "prompt": "Young professional in tailored navy coat walking confidently through rainy Tokyo street at night, neon signs reflecting in wet pavement creating colorful bokeh, camera tracking smoothly alongside at medium distance, subtle umbrella rotation as they navigate crowd, cinematic 24fps with natural motion blur, ambient city sounds with soft rain, moody cyberpunk atmosphere, anamorphic lens flare from passing car headlights",
  "styleSettings": {
    "mood": "cinematic",
    "style": "cyberpunk",
    "camera": "tracking",
    "lighting": "neon",
    "scene": "urban"
  },
  "category": "custom",
  "recommendedModel": "veo-3.1-fast",
  "aspectRatio": "16:9",
  "mediaType": "video"
}
```

## Bad vs Good Prompts

### Product Shot - Before

```
A nice photo of a watch
```

### Product Shot - After

```
Luxury chronograph watch with brushed titanium case, sapphire crystal face
reflecting studio lights, black leather strap with contrast stitching,
resting on dark slate surface, dramatic side lighting, commercial product
photography, 8K resolution, sharp focus
```

### Landscape - Before

```
Beautiful mountain sunset
```

### Landscape - After

```
Jagged alpine peaks of the Dolomites at golden hour, warm orange and pink
light painting limestone faces, deep blue shadows in valleys, thin cirrus
clouds catching final sunlight, wildflower meadow in foreground, landscape
photography, 16:9 panoramic, vibrant natural colors
```

## Tips

1. **Be specific**: Replace vague words like "beautiful" or "nice" with concrete visual descriptors
2. **Use the hierarchy**: Subject first, then action, environment, lighting, style, technical details
3. **Include quality terms**: "8K", "sharp focus", "professional", "high detail"
4. **For video**: Add motion keywords for camera movement and subject animation
5. **Match aspect ratio to use case**: 9:16 for social stories, 16:9 for widescreen, 1:1 for squares

## License

MIT
