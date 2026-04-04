# Replicate Service Integration

Comprehensive documentation for all Replicate AI models integrated into Genfeed.

## Overview

The Replicate service provides access to multiple AI models for image generation, video generation, and media transformation through Replicate's unified API. This document details the official input schemas for each model and how they map to Genfeed's universal parameter system.

## Supported Models

### Image Generation

- **Google Imagen 3** - High-quality photorealistic images
- **Google Imagen 3 Fast** - Faster variant with good quality
- **Google Imagen 4** - Latest generation, improved quality
- **Google Imagen 4 Fast** - Fast variant of Imagen 4
- **Google Imagen 4 Ultra** - Highest quality Imagen model
- **Google Nano Banana** - Image transformation with reference support
- **Google Nano Banana Pro** - Enhanced image transformation with resolution control (1K/2K/4K)
- **Ideogram Character** - Character-consistent image generation with required character reference
- **Ideogram V3 Balanced** - Balanced image generation with style presets and reference support
- **Ideogram V3 Quality** - High-quality image generation with style presets and reference support
- **Ideogram V3 Turbo** - Fast image generation with style presets and reference support
- **ByteDance SeeDream 4** - Image generation with multi-image reference and sequential generation
- **ByteDance SeeDream 4.5** - Enhanced image generation with 2K/4K resolution and multi-image reference
- **Black Forest Labs FLUX 1.1 Pro** - High-quality image generation with FLUX Redux support
- **Black Forest Labs FLUX 2 Dev** - Next-generation image generation with multi-image input support
- **Black Forest Labs FLUX 2 Flex** - Advanced image generation with full control over guidance and resolution
- **Black Forest Labs FLUX 2 Pro** - Professional-grade image generation with multi-image input support
- **Black Forest Labs Flux Kontext Pro** - Advanced image generation with reference support and prompt upsampling
- **Black Forest Labs FLUX Schnell** - Fast image generation optimized for speed
- **OpenAI GPT Image 1.5** - Image generation with precise control, better instruction following, and image editing capabilities
- **Qwen Image** - Image generation with img2img pipeline and LoRA support
- **RunwayML Gen4 Image Turbo** - Fast image generation with reference image tagging system

### Video Generation

- **Google Veo 2** - Text-to-video generation
- **Google Veo 3** - Enhanced video generation with audio
- **Google Veo 3 Fast** - Faster Veo 3 variant
- **Google Veo 3.1** - Latest with I2V, R2V, and interpolation
- **Google Veo 3.1 Fast** - Fast variant of Veo 3.1
- **Kwaivgi Kling V1.6 Pro** - Video generation with optional I2V, interpolation, and reference images
- **Kwaivgi Kling V2.1** - Image-to-video generation (I2V only, requires start_image)
- **Kwaivgi Kling V2.1 Master** - Video generation with optional I2V
- **Kwaivgi Kling V2.5 Turbo Pro** - Fast video generation with optional I2V
- **OpenAI Sora 2** - Video generation with synced audio
- **OpenAI Sora 2 Pro** - Most advanced synced-audio video generation
- **WAN Video 2.2 I2V Fast** - Fast image-to-video generation

### Media Transformation

- **Luma Reframe Image** - Image aspect ratio transformation
- **Luma Reframe Video** - Video aspect ratio transformation
- **Topaz Image Upscale** - AI-powered image upscaling
- **Topaz Video Upscale** - AI-powered video upscaling

### Audio Generation

- **Meta MusicGen** - Music generation from text prompts

---

## Model Schemas

### Google Nano Banana

**Model ID:** `google/nano-banana`
**Purpose:** Image transformation and generation with reference image support
**Category:** Image Generation

#### Official Replicate Schema

```json
{
  "type": "object",
  "title": "Input",
  "required": ["prompt"],
  "properties": {
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "x-order": 0,
      "description": "A text description of the image you want to generate"
    },
    "image_input": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "uri"
      },
      "title": "Image Input",
      "default": [],
      "x-order": 1,
      "description": "Input images to transform or use as reference (supports multiple images)"
    },
    "aspect_ratio": {
      "enum": [
        "match_input_image",
        "1:1",
        "2:3",
        "3:2",
        "3:4",
        "4:3",
        "4:5",
        "5:4",
        "9:16",
        "16:9",
        "21:9"
      ],
      "type": "string",
      "title": "aspect_ratio",
      "description": "Aspect ratio of the generated image",
      "default": "match_input_image",
      "x-order": 2
    },
    "output_format": {
      "enum": ["jpg", "png"],
      "type": "string",
      "title": "output_format",
      "description": "Format of the output image",
      "default": "jpg",
      "x-order": 3
    }
  }
}
```

#### Genfeed Mapping

```typescript
import { calculateAspectRatio } from '@genfeedai/helpers';

// From PromptBuilderParams to Nano Banana schema
{
  prompt: JsonPromptBuilder.stringify(jsonPrompt),  // Structured prompt
  aspect_ratio: calculateAspectRatio(params.width, params.height)
    || (hasImageInput ? 'match_input_image' : '1:1'),
  output_format: 'jpg',
  image_input: params.references  // Array of image URLs
}
```

**Smart Defaults:**

- If `image_input` provided → `aspect_ratio: 'match_input_image'`
- If no dimensions and no images → `aspect_ratio: '1:1'`
- If dimensions provided → Calculated ratio (e.g., 1920x1080 → '16:9')

---

### Google Nano Banana Pro

**Model ID:** `google/nano-banana-pro`
**Purpose:** Enhanced image transformation and generation with multi-image reference support and resolution control
**Category:** Image Generation

#### Official Replicate Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "nano-banana-pro Input Schema",
  "description": "Official Replicate API schema for google/nano-banana-pro",
  "required": ["prompt"],
  "properties": {
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "x-order": 0,
      "description": "A text description of the image you want to generate"
    },
    "resolution": {
      "enum": ["1K", "2K", "4K"],
      "type": "string",
      "title": "resolution",
      "description": "An enumeration."
    },
    "image_input": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "uri"
      },
      "title": "Image Input",
      "default": [],
      "x-order": 1,
      "description": "Input images to transform or use as reference (supports up to 14 images)"
    },
    "aspect_ratio": {
      "enum": [
        "match_input_image",
        "1:1",
        "2:3",
        "3:2",
        "3:4",
        "4:3",
        "4:5",
        "5:4",
        "9:16",
        "16:9",
        "21:9"
      ],
      "type": "string",
      "title": "aspect_ratio",
      "description": "An enumeration."
    },
    "output_format": {
      "enum": ["jpg", "png"],
      "type": "string",
      "title": "output_format",
      "description": "An enumeration."
    },
    "safety_filter_level": {
      "enum": [
        "block_low_and_above",
        "block_medium_and_above",
        "block_only_high"
      ],
      "type": "string",
      "title": "safety_filter_level",
      "description": "An enumeration."
    }
  }
}
```

#### Genfeed Mapping

```typescript
import { calculateAspectRatio } from '@genfeedai/helpers';

// From PromptBuilderParams to Nano Banana Pro schema
{
  prompt: JsonPromptBuilder.stringify(jsonPrompt),  // Structured prompt
  aspect_ratio: calculateAspectRatio(params.width, params.height)
    || (hasImageInput ? 'match_input_image' : '1:1'),
  output_format: 'jpg',
  safety_filter_level: 'block_only_high',
  resolution: params.resolution,  // Optional: '1K', '2K', or '4K'
  image_input: params.references.slice(0, 14)  // Up to 14 image URLs
}
```

**Smart Defaults:**

- If `image_input` provided → `aspect_ratio: 'match_input_image'`
- If no dimensions and no images → `aspect_ratio: '1:1'`
- If dimensions provided → Calculated ratio (e.g., 1920x1080 → '16:9')
- Safety filter → `'block_only_high'` (least restrictive)

**Key Differences from Nano Banana:**

- Supports resolution parameter (1K, 2K, 4K)
- Supports safety filter level control
- Supports up to 14 reference images (vs 15 in base model)

---

### ByteDance SeeDream 4

**Model ID:** `bytedance/seedream-4`
**Purpose:** Image generation with multi-image reference support and sequential generation
**Category:** Image Generation

#### Official Replicate Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "seedream-4 Input Schema",
  "description": "Official Replicate API schema for bytedance/seedream-4",
  "required": ["prompt"],
  "properties": {
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "description": "Text prompt for image generation"
    },
    "image_input": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "uri"
      },
      "title": "Image Input",
      "default": [],
      "description": "Input image(s) for image-to-image generation. List of 1-10 images for single or multi-reference generation."
    },
    "aspect_ratio": {
      "enum": [
        "match_input_image",
        "1:1",
        "4:3",
        "3:4",
        "16:9",
        "9:16",
        "3:2",
        "2:3",
        "21:9"
      ],
      "type": "string",
      "title": "aspect_ratio",
      "description": "Aspect ratio of the generated image"
    },
    "size": {
      "enum": ["1K", "2K", "4K", "custom"],
      "type": "string",
      "title": "size",
      "description": "Preset resolution size"
    },
    "width": {
      "type": "integer",
      "title": "Width",
      "default": 2048,
      "minimum": 1024,
      "maximum": 4096,
      "description": "Custom image width (only used when size='custom'). Range: 1024-4096 pixels."
    },
    "height": {
      "type": "integer",
      "title": "Height",
      "default": 2048,
      "minimum": 1024,
      "maximum": 4096,
      "description": "Custom image height (only used when size='custom'). Range: 1024-4096 pixels."
    },
    "enhance_prompt": {
      "type": "boolean",
      "title": "Enhance Prompt",
      "default": true,
      "description": "Enable prompt enhancement for higher quality results, this will take longer to generate."
    },
    "sequential_image_generation": {
      "enum": ["disabled", "auto"],
      "type": "string",
      "title": "sequential_image_generation",
      "description": "Enable sequential image generation mode"
    },
    "max_images": {
      "type": "integer",
      "title": "Max Images",
      "default": 1,
      "minimum": 1,
      "maximum": 15,
      "description": "Maximum number of images to generate when sequential_image_generation='auto'. Range: 1-15. Total images (input + generated) cannot exceed 15."
    }
  }
}
```

#### Genfeed Mapping

```typescript
import { calculateAspectRatio, getDefaultAspectRatio } from '@genfeedai/helpers';

// From PromptBuilderParams to SeeDream 4 schema
{
  prompt: JsonPromptBuilder.stringify(jsonPrompt),  // Structured prompt
  aspect_ratio: calculateAspectRatio(params.width, params.height)
    || (hasImageInput ? 'match_input_image' : getDefaultAspectRatio(model)),
  enhance_prompt: params.enhancePrompt ?? true,
  sequential_image_generation: params.sequentialImageGeneration ?? 'disabled',
  image_input: params.references?.slice(0, 10),  // Up to 10 reference images
  max_images: params.maxImages ?? 1  // Only when sequential_image_generation='auto'
}
```

**Smart Defaults:**

- If `image_input` provided → `aspect_ratio: 'match_input_image'`
- If no dimensions and no images → Default aspect ratio for model
- If dimensions provided → Calculated ratio (e.g., 1920x1080 → '16:9')
- `enhance_prompt: true` for better quality (but slower generation)
- `sequential_image_generation: 'disabled'` unless explicitly enabled
- Supports 1-10 reference images for multi-reference generation

---

### ByteDance SeeDream 4.5

**Model ID:** `bytedance/seedream-4.5`
**Purpose:** Enhanced image generation with 2K/4K resolution and multi-image reference support
**Category:** Image Generation

#### Official Replicate Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "seedream-4.5 Input Schema",
  "description": "Official Replicate API schema for bytedance/seedream-4.5",
  "required": ["prompt"],
  "properties": {
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "description": "Text prompt for image generation"
    },
    "image_input": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "uri"
      },
      "title": "Image Input",
      "default": [],
      "description": "Input image(s) for image-to-image generation. List of 1-14 images for single or multi-reference generation."
    },
    "aspect_ratio": {
      "enum": [
        "match_input_image",
        "1:1",
        "4:3",
        "3:4",
        "16:9",
        "9:16",
        "3:2",
        "2:3",
        "21:9"
      ],
      "type": "string",
      "title": "aspect_ratio",
      "description": "Aspect ratio of the generated image"
    },
    "size": {
      "enum": ["2K", "4K", "custom"],
      "type": "string",
      "title": "size",
      "description": "Preset resolution size"
    },
    "width": {
      "type": "integer",
      "title": "Width",
      "default": 2048,
      "minimum": 1024,
      "maximum": 4096,
      "description": "Custom image width (only used when size='custom'). Range: 1024-4096 pixels."
    },
    "height": {
      "type": "integer",
      "title": "Height",
      "default": 2048,
      "minimum": 1024,
      "maximum": 4096,
      "description": "Custom image height (only used when size='custom'). Range: 1024-4096 pixels."
    },
    "sequential_image_generation": {
      "enum": ["disabled", "auto"],
      "type": "string",
      "title": "sequential_image_generation",
      "description": "Enable sequential image generation mode"
    },
    "max_images": {
      "type": "integer",
      "title": "Max Images",
      "default": 1,
      "minimum": 1,
      "maximum": 15,
      "description": "Maximum number of images to generate when sequential_image_generation='auto'. Range: 1-15. Total images (input + generated) cannot exceed 15."
    }
  }
}
```

#### Genfeed Mapping

```typescript
import { calculateAspectRatio, getDefaultAspectRatio } from '@genfeedai/helpers';

// From PromptBuilderParams to SeeDream 4.5 schema
{
  prompt: JsonPromptBuilder.stringify(jsonPrompt),  // Structured prompt
  aspect_ratio: calculateAspectRatio(params.width, params.height)
    || (hasImageInput ? 'match_input_image' : getDefaultAspectRatio(model)),
  size: '2K',  // Default to 2K resolution
  image_input: params.references?.slice(0, 14),  // Up to 14 reference images
}
```

**Smart Defaults:**

- If `image_input` provided → `aspect_ratio: 'match_input_image'`
- If no dimensions and no images → Default aspect ratio for model
- If dimensions provided → Calculated ratio (e.g., 1920x1080 → '16:9')
- `size: '2K'` default resolution (higher quality than v4)
- Supports 1-14 reference images for multi-reference generation (increased from v4's 10)
- Supports batch generation with `max_images` up to 15

---

### Black Forest Labs FLUX 1.1 Pro

**Model ID:** `black-forest-labs/flux-1.1-pro`
**Purpose:** High-quality image generation with FLUX Redux support
**Category:** Image Generation

#### Official Replicate Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "flux-1.1-pro Input Schema",
  "description": "Official Replicate API schema for black-forest-labs/flux-1.1-pro",
  "required": ["prompt"],
  "properties": {
    "seed": {
      "type": "integer",
      "title": "Seed",
      "description": "Random seed. Set for reproducible generation"
    },
    "width": {
      "type": "integer",
      "title": "Width",
      "maximum": 1440,
      "minimum": 256,
      "description": "Width of the generated image in text-to-image mode. Only used when aspect_ratio=custom. Must be a multiple of 32 (if it's not, it will be rounded to nearest multiple of 32). Note: Ignored in img2img and inpainting modes."
    },
    "height": {
      "type": "integer",
      "title": "Height",
      "maximum": 1440,
      "minimum": 256,
      "description": "Height of the generated image in text-to-image mode. Only used when aspect_ratio=custom. Must be a multiple of 32 (if it's not, it will be rounded to nearest multiple of 32). Note: Ignored in img2img and inpainting modes."
    },
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "description": "Text prompt for image generation"
    },
    "aspect_ratio": {
      "enum": [
        "custom",
        "1:1",
        "16:9",
        "3:2",
        "2:3",
        "4:5",
        "5:4",
        "9:16",
        "3:4",
        "4:3"
      ],
      "type": "string",
      "title": "aspect_ratio",
      "description": "An enumeration."
    },
    "image_prompt": {
      "type": "string",
      "title": "Image Prompt",
      "format": "uri",
      "description": "Image to use with Flux Redux. This is used together with the text prompt to guide the generation towards the composition of the image_prompt. Must be jpeg, png, gif, or webp."
    },
    "output_format": {
      "enum": ["webp", "jpg", "png"],
      "type": "string",
      "title": "output_format",
      "description": "An enumeration."
    },
    "output_quality": {
      "type": "integer",
      "title": "Output Quality",
      "default": 80,
      "maximum": 100,
      "minimum": 0,
      "description": "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
    },
    "safety_tolerance": {
      "type": "integer",
      "title": "Safety Tolerance",
      "default": 2,
      "maximum": 6,
      "minimum": 1,
      "description": "Safety tolerance, 1 is most strict and 6 is most permissive"
    },
    "prompt_upsampling": {
      "type": "boolean",
      "title": "Prompt Upsampling",
      "default": false,
      "description": "Automatically modify the prompt for more creative generation"
    }
  }
}
```

#### Genfeed Mapping

```typescript
import { calculateAspectRatio, getDefaultAspectRatio } from '@genfeedai/helpers';

// From PromptBuilderParams to FLUX 1.1 Pro schema
{
  prompt: JsonPromptBuilder.stringify(jsonPrompt),  // Structured prompt
  aspect_ratio: calculateAspectRatio(params.width, params.height)
    || (hasImageInput ? 'custom' : getDefaultAspectRatio(model)),
  output_format: params.outputFormat ?? 'webp',
  output_quality: params.outputQuality ?? 80,
  safety_tolerance: params.safetyTolerance ?? 2,
  prompt_upsampling: params.promptUpsampling ?? false,
  seed: params.seed,  // Optional, only added if provided
  image_prompt: params.references?.[0],  // FLUX Redux reference image
  width: params.width ?? 1024,  // Only used when aspect_ratio='custom'
  height: params.height ?? 1024  // Only used when aspect_ratio='custom'
}
```

**Smart Defaults:**

- If `image_prompt` provided → `aspect_ratio: 'custom'` with explicit width/height
- If no dimensions and no image → Default aspect ratio for model
- If dimensions provided → Calculated ratio (e.g., 1920x1080 → '16:9')
- `output_format: 'webp'` (best quality/size balance)
- `output_quality: 80` (good quality, reasonable file size)
- `safety_tolerance: 2` (balanced filtering)
- `prompt_upsampling: false` (manual prompt control)
- Supports FLUX Redux with single reference image as `image_prompt`
- Width/height must be multiples of 32 (256-1440 range)

---

### Black Forest Labs FLUX 2 Dev

**Model ID:** `black-forest-labs/flux-2-dev`
**Purpose:** Next-generation image generation with multi-image input support
**Category:** Image Generation

#### Official Replicate Schema

See: `services/integrations/replicate/schemas/flux-2-dev.schema.json`

**Key Properties:**

- `prompt` (required): Text description of the image to generate
- `input_images` (optional): Array of input images for image-to-image generation (max 4 images)
- `aspect_ratio` (optional): match_input_image, custom, 1:1, 16:9, 3:2, 2:3, 4:5, 5:4, 9:16, 3:4, 4:3
- `width` (optional): Width (256-1440, must be multiple of 32, only used when aspect_ratio=custom)
- `height` (optional): Height (256-1440, must be multiple of 32, only used when aspect_ratio=custom)
- `go_fast` (optional): Enable faster predictions with additional optimizations (default: true)
- `seed` (optional): Random seed for reproducibility
- `output_format` (optional): webp, jpg, png
- `output_quality` (optional): 0-100 (default: 80)
- `disable_safety_checker` (optional): Disable safety filtering (default: false)

#### Genfeed Mapping

```typescript
{
  prompt: promptText,
  aspect_ratio: calculatedAspectRatio || (hasImageInput ? 'match_input_image' : '1:1'),
  go_fast: true,
  output_format: 'jpg',
  output_quality: 80,
  disable_safety_checker: false,
  seed: params.seed,  // Optional
  input_images: params.references?.slice(0, 4),  // Up to 4 input images
  width: params.width ?? 1024,  // Only used when aspect_ratio='custom'
  height: params.height ?? 1024  // Only used when aspect_ratio='custom'
}
```

**Smart Defaults:**

- If `input_images` provided → `aspect_ratio: 'match_input_image'`
- `go_fast: true` (enable optimizations for faster generation)
- Supports up to 4 input images for image-to-image generation
- Width/height must be multiples of 32 (256-1440 range)

---

### Black Forest Labs FLUX 2 Pro

**Model ID:** `black-forest-labs/flux-2-pro`
**Purpose:** Professional-grade image generation with multi-image input support
**Category:** Image Generation

#### Official Replicate Schema

See: `services/integrations/replicate/schemas/flux-2-pro.schema.json`

**Key Properties:**

- `prompt` (required): Text prompt for image generation
- `input_images` (optional): Array of input images for image-to-image generation (max 8 images)
- `aspect_ratio` (optional): match_input_image, custom, 1:1, 16:9, 3:2, 2:3, 4:5, 5:4, 9:16, 3:4, 4:3
- `resolution` (optional): match_input_image, 0.5 MP, 1 MP, 2 MP, 4 MP
- `width` (optional): Width (256-2048, must be multiple of 32, only used when aspect_ratio=custom)
- `height` (optional): Height (256-2048, must be multiple of 32, only used when aspect_ratio=custom)
- `seed` (optional): Random seed for reproducibility
- `safety_tolerance` (optional): 1-5 (1 most strict, 5 most permissive, default: 2)
- `output_format` (optional): webp, jpg, png
- `output_quality` (optional): 0-100 (default: 80)

#### Genfeed Mapping

```typescript
{
  prompt: promptText,
  aspect_ratio: calculatedAspectRatio || (hasImageInput ? 'match_input_image' : '1:1'),
  resolution: params.resolution || (hasImageInput ? 'match_input_image' : undefined),
  safety_tolerance: 2,
  output_format: 'jpg',
  output_quality: 80,
  seed: params.seed,  // Optional
  input_images: params.references?.slice(0, 8),  // Up to 8 input images
  width: params.width ?? 1024,  // Only used when aspect_ratio='custom'
  height: params.height ?? 1024  // Only used when aspect_ratio='custom'
}
```

**Smart Defaults:**

- If `input_images` provided → `aspect_ratio: 'match_input_image'` and `resolution: 'match_input_image'`
- `safety_tolerance: 2` (balanced filtering)
- Supports up to 8 input images for image-to-image generation
- Width/height must be multiples of 32 (256-2048 range)
- Resolution selection: 0.5 MP, 1 MP, 2 MP, 4 MP, or match input

---

### Black Forest Labs FLUX 2 Flex

**Model ID:** `black-forest-labs/flux-2-flex`
**Purpose:** Advanced image generation with full control over guidance and resolution
**Category:** Image Generation

#### Official Replicate Schema

See: `services/integrations/replicate/schemas/flux-2-flex.schema.json`

**Key Properties:**

- `prompt` (required): Text prompt for image generation
- `input_images` (optional): Array of input images for image-to-image generation (max 10 images)
- `aspect_ratio` (optional): match_input_image, custom, 1:1, 16:9, 3:2, 2:3, 4:5, 5:4, 9:16, 3:4, 4:3
- `resolution` (optional): match_input_image, 0.5 MP, 1 MP, 2 MP, 4 MP
- `width` (optional): Width (256-2048, must be multiple of 32, only used when aspect_ratio=custom)
- `height` (optional): Height (256-2048, must be multiple of 32, only used when aspect_ratio=custom)
- `steps` (optional): Number of inference steps (1-50, default: 30)
- `guidance` (optional): Guidance scale (1.5-10, default: 4.5)
- `prompt_upsampling` (optional): Automatically modify prompt for more creative generation (default: true)
- `seed` (optional): Random seed for reproducibility
- `safety_tolerance` (optional): 1-5 (1 most strict, 5 most permissive, default: 2)
- `output_format` (optional): webp, jpg, png
- `output_quality` (optional): 0-100 (default: 80)

#### Genfeed Mapping

```typescript
{
  prompt: promptText,
  aspect_ratio: calculatedAspectRatio || (hasImageInput ? 'match_input_image' : '1:1'),
  resolution: params.resolution || (hasImageInput ? 'match_input_image' : undefined),
  steps: 30,
  guidance: 4.5,
  prompt_upsampling: true,
  safety_tolerance: 2,
  output_format: 'jpg',
  output_quality: 80,
  seed: params.seed,  // Optional
  input_images: params.references?.slice(0, 10),  // Up to 10 input images
  width: params.width ?? 1024,  // Only used when aspect_ratio='custom'
  height: params.height ?? 1024  // Only used when aspect_ratio='custom'
}
```

**Smart Defaults:**

- If `input_images` provided → `aspect_ratio: 'match_input_image'` and `resolution: 'match_input_image'`
- `steps: 30` (good quality/speed balance)
- `guidance: 4.5` (balanced prompt following)
- `prompt_upsampling: true` (automatic prompt enhancement for creativity)
- `safety_tolerance: 2` (balanced filtering)
- Supports up to 10 input images for image-to-image generation
- Width/height must be multiples of 32 (256-2048 range)
- Resolution selection: 0.5 MP, 1 MP, 2 MP, 4 MP, or match input

---

### Black Forest Labs Flux Kontext Pro

**Model ID:** `black-forest-labs/flux-kontext-pro`
**Purpose:** Advanced image generation with reference support and prompt upsampling
**Category:** Image Generation

#### Official Replicate Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "flux-kontext-pro Input Schema",
  "description": "Official Replicate API schema for black-forest-labs/flux-kontext-pro",
  "required": ["prompt"],
  "properties": {
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "description": "Text description of what you want to generate, or the instruction on how to edit the given image."
    },
    "input_image": {
      "type": "string",
      "title": "Input Image",
      "format": "uri",
      "nullable": true,
      "description": "Image to use as reference. Must be jpeg, png, gif, or webp."
    },
    "aspect_ratio": {
      "enum": [
        "match_input_image",
        "1:1",
        "16:9",
        "9:16",
        "4:3",
        "3:4",
        "3:2",
        "2:3",
        "4:5",
        "5:4",
        "21:9",
        "9:21",
        "2:1",
        "1:2"
      ],
      "type": "string",
      "title": "aspect_ratio",
      "description": "Aspect ratio of the generated image"
    },
    "output_format": {
      "enum": ["jpg", "png"],
      "type": "string",
      "title": "output_format",
      "description": "Format of the output image"
    },
    "safety_tolerance": {
      "type": "integer",
      "title": "Safety Tolerance",
      "default": 2,
      "minimum": 0,
      "maximum": 6,
      "description": "Safety tolerance, 0 is most strict and 6 is most permissive. 2 is currently the maximum allowed when input images are used."
    },
    "prompt_upsampling": {
      "type": "boolean",
      "title": "Prompt Upsampling",
      "default": false,
      "description": "Automatic prompt improvement"
    },
    "seed": {
      "type": "integer",
      "title": "Seed",
      "nullable": true,
      "description": "Random seed. Set for reproducible generation"
    }
  }
}
```

#### Genfeed Mapping

```typescript
import { calculateAspectRatio, getDefaultAspectRatio } from '@genfeedai/helpers';

// From PromptBuilderParams to Flux Kontext Pro schema
{
  prompt: JsonPromptBuilder.stringify(jsonPrompt),  // Structured prompt
  aspect_ratio: calculateAspectRatio(params.width, params.height)
    || (hasImageInput ? 'match_input_image' : getDefaultAspectRatio(model)),
  output_format: 'jpg',
  safety_tolerance: params.safetyTolerance ?? 2,
  prompt_upsampling: params.promptUpsampling ?? false,
  seed: params.seed,  // Optional, only added if provided
  input_image: params.references?.[0]  // Single reference image support
}
```

**Smart Defaults:**

- If `input_image` provided → `aspect_ratio: 'match_input_image'`
- If no dimensions and no image → Default aspect ratio for model
- If dimensions provided → Calculated ratio (e.g., 1920x1080 → '16:9')
- `safety_tolerance: 2` (balanced, max when using input images)
- `prompt_upsampling: false` (manual prompt control)
- `output_format: 'jpg'` (efficient file size)
- Supports single reference image for guided generation

---

### Black Forest Labs FLUX Schnell

**Model ID:** `black-forest-labs/flux-schnell`
**Purpose:** Fast image generation optimized for speed
**Category:** Image Generation

#### Official Replicate Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "flux-schnell Input Schema",
  "description": "Official Replicate API schema for black-forest-labs/flux-schnell",
  "required": ["prompt"],
  "properties": {
    "seed": {
      "type": "integer",
      "title": "Seed",
      "x-order": 4,
      "description": "Random seed. Set for reproducible generation"
    },
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "x-order": 0,
      "description": "Prompt for generated image"
    },
    "go_fast": {
      "type": "boolean",
      "title": "Go Fast",
      "default": true,
      "x-order": 8,
      "description": "Run faster predictions with model optimized for speed (currently fp8 quantized); disable to run in original bf16. Note that outputs will not be deterministic when this is enabled, even if you set a seed."
    },
    "megapixels": {
      "enum": ["1", "0.25"],
      "type": "string",
      "title": "megapixels",
      "description": "An enumeration."
    },
    "num_outputs": {
      "type": "integer",
      "title": "Num Outputs",
      "default": 1,
      "maximum": 4,
      "minimum": 1,
      "x-order": 2,
      "description": "Number of outputs to generate"
    },
    "aspect_ratio": {
      "enum": [
        "1:1",
        "16:9",
        "21:9",
        "3:2",
        "2:3",
        "4:5",
        "5:4",
        "3:4",
        "4:3",
        "9:16",
        "9:21"
      ],
      "type": "string",
      "title": "aspect_ratio",
      "description": "An enumeration."
    },
    "output_format": {
      "enum": ["webp", "jpg", "png"],
      "type": "string",
      "title": "output_format",
      "description": "An enumeration."
    },
    "output_quality": {
      "type": "integer",
      "title": "Output Quality",
      "default": 80,
      "maximum": 100,
      "minimum": 0,
      "x-order": 6,
      "description": "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
    },
    "num_inference_steps": {
      "type": "integer",
      "title": "Num Inference Steps",
      "default": 4,
      "maximum": 4,
      "minimum": 1,
      "x-order": 3,
      "description": "Number of denoising steps. 4 is recommended, and lower number of steps produce lower quality outputs, faster."
    },
    "disable_safety_checker": {
      "type": "boolean",
      "title": "Disable Safety Checker",
      "default": false,
      "x-order": 7,
      "description": "Disable safety checker for generated images."
    }
  }
}
```

#### Genfeed Mapping

```typescript
import { calculateAspectRatio, getDefaultAspectRatio } from '@genfeedai/helpers';

// From PromptBuilderParams to FLUX Schnell schema
{
  prompt: JsonPromptBuilder.stringify(jsonPrompt),  // Structured prompt
  aspect_ratio: calculateAspectRatio(params.width, params.height)
    || getDefaultAspectRatio(model),
  num_outputs: params.outputs ?? 1,
  num_inference_steps: params.numInferenceSteps ?? 4,
  go_fast: params.goFast ?? true,
  output_format: params.outputFormat ?? 'webp',
  output_quality: params.outputQuality ?? 80,
  disable_safety_checker: params.disableSafetyChecker ?? false,
  seed: params.seed,  // Optional, only added if provided
  megapixels: params.megapixels  // Optional enum: "1" or "0.25"
}
```

**Smart Defaults:**

- `num_outputs: 1` (single image generation)
- `num_inference_steps: 4` (optimal for Schnell, max 4 steps)
- `go_fast: true` (fp8 quantization for speed, non-deterministic)
- `output_format: 'webp'` (best quality/size balance)
- `output_quality: 80` (good quality, reasonable file size)
- `disable_safety_checker: false` (safety filtering enabled)
- Supports 1-4 outputs per generation
- Optimized for speed with minimal inference steps
- `megapixels` is optional (1 MP or 0.25 MP)

---

### Black Forest Labs FLUX 2 Flex

**Model ID:** `black-forest-labs/flux-2-flex`
**Purpose:** Advanced image generation with full control over guidance, resolution, and multi-image input
**Category:** Image Generation

#### Official Replicate Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "flux-2-flex Input Schema",
  "description": "Official Replicate API schema for black-forest-labs/flux-2-flex",
  "required": ["prompt"],
  "properties": {
    "seed": {
      "type": "integer",
      "title": "Seed",
      "x-order": 7,
      "description": "Random seed. Set for reproducible generation"
    },
    "steps": {
      "type": "integer",
      "title": "Steps",
      "default": 30,
      "maximum": 50,
      "minimum": 1,
      "x-order": 9,
      "description": "Number of inference steps"
    },
    "width": {
      "type": "integer",
      "title": "Width",
      "maximum": 2048,
      "minimum": 256,
      "x-order": 4,
      "nullable": true,
      "description": "Width of the generated image. Only used when aspect_ratio=custom. Must be a multiple of 32 (if it's not, it will be rounded to nearest multiple of 32)."
    },
    "height": {
      "type": "integer",
      "title": "Height",
      "maximum": 2048,
      "minimum": 256,
      "x-order": 5,
      "nullable": true,
      "description": "Height of the generated image. Only used when aspect_ratio=custom. Must be a multiple of 32 (if it's not, it will be rounded to nearest multiple of 32)."
    },
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "x-order": 0,
      "description": "Text prompt for image generation"
    },
    "guidance": {
      "type": "number",
      "title": "Guidance",
      "default": 4.5,
      "maximum": 10,
      "minimum": 1.5,
      "x-order": 10,
      "description": "Guidance scale for generation. Controls how closely the output follows the prompt"
    },
    "resolution": {
      "enum": ["match_input_image", "0.5 MP", "1 MP", "2 MP", "4 MP"],
      "type": "string",
      "title": "resolution",
      "description": "An enumeration."
    },
    "aspect_ratio": {
      "enum": [
        "match_input_image",
        "custom",
        "1:1",
        "16:9",
        "3:2",
        "2:3",
        "4:5",
        "5:4",
        "9:16",
        "3:4",
        "4:3"
      ],
      "type": "string",
      "title": "aspect_ratio",
      "description": "An enumeration."
    },
    "input_images": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "uri"
      },
      "title": "Input Images",
      "default": [],
      "x-order": 1,
      "description": "List of input images for image-to-image generation. Maximum 10 images. Must be jpeg, png, gif, or webp."
    },
    "output_format": {
      "enum": ["webp", "jpg", "png"],
      "type": "string",
      "title": "output_format",
      "description": "An enumeration."
    },
    "output_quality": {
      "type": "integer",
      "title": "Output Quality",
      "default": 80,
      "maximum": 100,
      "minimum": 0,
      "x-order": 12,
      "description": "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
    },
    "safety_tolerance": {
      "type": "integer",
      "title": "Safety Tolerance",
      "default": 2,
      "maximum": 5,
      "minimum": 1,
      "x-order": 6,
      "description": "Safety tolerance, 1 is most strict and 5 is most permissive"
    },
    "prompt_upsampling": {
      "type": "boolean",
      "title": "Prompt Upsampling",
      "default": true,
      "x-order": 8,
      "description": "Automatically modify the prompt for more creative generation"
    }
  }
}
```

#### Genfeed Mapping

```typescript
import { calculateAspectRatio, getDefaultAspectRatio } from '@genfeedai/helpers';

// From PromptBuilderParams to FLUX 2 Flex schema
{
  prompt: JsonPromptBuilder.stringify(jsonPrompt),  // Structured prompt
  aspect_ratio: calculateAspectRatio(params.width, params.height)
    || (hasImageInput ? 'match_input_image' : getDefaultAspectRatio(model)),
  steps: 30,
  guidance: 4.5,
  prompt_upsampling: true,
  safety_tolerance: 2,
  output_format: 'jpg',
  output_quality: 80,
  seed: params.seed,  // Optional seed for reproducibility
  resolution: params.resolution || (hasImageInput ? 'match_input_image' : undefined),
  input_images: params.references?.slice(0, 10),  // Up to 10 input images
  width: params.width,   // Only used when aspect_ratio='custom'
  height: params.height  // Only used when aspect_ratio='custom'
}
```

**Smart Defaults:**

- `steps: 30` (balanced quality and speed, max 50)
- `guidance: 4.5` (moderate guidance scale, range 1.5-10)
- `prompt_upsampling: true` (enhanced prompt creativity)
- `safety_tolerance: 2` (moderate safety, range 1-5)
- `output_format: 'jpg'` (efficient output format)
- `output_quality: 80` (good quality, reasonable file size)
- Supports up to 10 input images via `input_images` array
- Resolution options: 0.5 MP, 1 MP, 2 MP, 4 MP, or match_input_image
- Aspect ratio: Supports custom dimensions or predefined ratios
- When `aspect_ratio='custom'`, width and height are used (must be multiples of 32)
- When `aspect_ratio='match_input_image'`, output matches first input image's ratio
- Full control over inference steps, guidance scale, and safety tolerance

---

### OpenAI GPT Image 1.5

**Model ID:** `openai/gpt-image-1.5`
**Purpose:** Image generation with precise control, better instruction following, and image editing capabilities
**Category:** Image Generation

#### Official Replicate Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "gpt-image-1.5 Input Schema",
  "description": "Official Replicate API schema for openai/gpt-image-1.5",
  "required": ["prompt"],
  "properties": {
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "x-order": 0,
      "description": "A text description of the desired image"
    },
    "quality": {
      "enum": ["low", "medium", "high", "auto"],
      "type": "string",
      "title": "quality",
      "description": "An enumeration."
    },
    "user_id": {
      "type": "string",
      "title": "User Id",
      "x-order": 11,
      "nullable": true,
      "description": "An optional unique identifier representing your end-user. This helps OpenAI monitor and detect abuse."
    },
    "background": {
      "enum": ["auto", "transparent", "opaque"],
      "type": "string",
      "title": "background",
      "description": "An enumeration."
    },
    "moderation": {
      "enum": ["auto", "low"],
      "type": "string",
      "title": "moderation",
      "description": "An enumeration."
    },
    "aspect_ratio": {
      "enum": ["1:1", "3:2", "2:3"],
      "type": "string",
      "title": "aspect_ratio",
      "description": "An enumeration."
    },
    "input_images": {
      "type": "array",
      "items": {
        "type": "string",
        "anyOf": [],
        "format": "uri"
      },
      "title": "Input Images",
      "x-order": 4,
      "nullable": true,
      "description": "A list of images to use as input for the generation"
    },
    "output_format": {
      "enum": ["png", "jpeg", "webp"],
      "type": "string",
      "title": "output_format",
      "description": "An enumeration."
    },
    "input_fidelity": {
      "enum": ["low", "high"],
      "type": "string",
      "title": "input_fidelity",
      "description": "An enumeration."
    },
    "openai_api_key": {
      "type": "string",
      "title": "Openai Api Key",
      "format": "password",
      "x-order": 1,
      "writeOnly": true,
      "description": "Your OpenAI API key (optional - uses proxy if not provided)",
      "x-cog-secret": true
    },
    "number_of_images": {
      "type": "integer",
      "title": "Number Of Images",
      "default": 1,
      "maximum": 10,
      "minimum": 1,
      "x-order": 5,
      "description": "Number of images to generate (1-10)"
    },
    "output_compression": {
      "type": "integer",
      "title": "Output Compression",
      "default": 90,
      "maximum": 100,
      "minimum": 0,
      "x-order": 8,
      "description": "Compression level (0-100%)"
    }
  }
}
```

#### Genfeed Mapping

```typescript
{
  prompt: JsonPromptBuilder.stringify(jsonPrompt),
  aspect_ratio: normalizeAspectRatioForModel(model, calculatedRatio || '1:1'),
  quality: params.quality, // Optional: 'low', 'medium', 'high', 'auto'
  output_format: params.outputFormat, // Optional: 'png', 'jpeg', 'webp'
  input_images: params.references?.slice(0, 10), // Optional: array of image URLs
  number_of_images: params.outputs ? Math.min(params.outputs, 10) : undefined // 1-10
}
```

**Key Features:**
- Supports 1-10 images per request via `number_of_images`
- Multiple aspect ratios: 1:1, 3:2, 2:3
- Optional input images for image editing/reference
- Quality control: low, medium, high, auto
- Multiple output formats: PNG, JPEG, WebP
- Background control: auto, transparent, opaque
- Input fidelity control for editing mode

**Smart Defaults:**
- Aspect ratio defaults to 1:1 if not calculated from width/height
- number_of_images defaults to 1 if not specified
- Quality defaults to 'auto' if not provided

---

### Qwen Image

**Model ID:** `qwen/qwen-image`
**Purpose:** Image generation with img2img pipeline and LoRA support
**Category:** Image Generation

#### Official Replicate Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "qwen-image Input Schema",
  "description": "Official Replicate API schema for qwen/qwen-image",
  "required": ["prompt"],
  "properties": {
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "description": "Prompt for generated image"
    },
    "aspect_ratio": {
      "enum": ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
      "type": "string",
      "title": "aspect_ratio",
      "description": "An enumeration."
    },
    "image": {
      "type": "string",
      "title": "Image",
      "format": "uri",
      "description": "Input image for img2img pipeline"
    },
    "strength": {
      "type": "number",
      "title": "Strength",
      "default": 0.9,
      "maximum": 1,
      "minimum": 0,
      "description": "Strength for img2img pipeline"
    },
    "guidance": {
      "type": "number",
      "title": "Guidance",
      "default": 3,
      "maximum": 10,
      "minimum": 0,
      "description": "Guidance for generated image. Lower values can give more realistic images. Good values to try are 2, 2.5, 3 and 3.5"
    },
    "num_inference_steps": {
      "type": "integer",
      "title": "Num Inference Steps",
      "default": 30,
      "maximum": 50,
      "minimum": 1,
      "description": "Number of denoising steps. Recommended range is 28-50, and lower number of steps produce lower quality outputs, faster."
    },
    "go_fast": {
      "type": "boolean",
      "title": "Go Fast",
      "default": true,
      "description": "Run faster predictions with additional optimizations."
    },
    "output_format": {
      "enum": ["webp", "jpg", "png"],
      "type": "string",
      "title": "output_format",
      "description": "An enumeration."
    },
    "output_quality": {
      "type": "integer",
      "title": "Output Quality",
      "default": 80,
      "maximum": 100,
      "minimum": 0,
      "description": "Quality when saving the output images, from 0 to 100. 100 is best quality, 0 is lowest quality. Not relevant for .png outputs"
    },
    "enhance_prompt": {
      "type": "boolean",
      "title": "Enhance Prompt",
      "default": false,
      "description": "Enhance the prompt with positive magic."
    },
    "negative_prompt": {
      "type": "string",
      "title": "Negative Prompt",
      "default": " ",
      "description": "Negative prompt for generated image"
    },
    "lora_weights": {
      "type": "string",
      "title": "Lora Weights",
      "nullable": true,
      "description": "Load LoRA weights. Only works with text to image pipeline. Supports arbitrary .safetensors URLs, tar files, and zip files from the Internet"
    },
    "lora_scale": {
      "type": "number",
      "title": "Lora Scale",
      "default": 1,
      "description": "Determines how strongly the main LoRA should be applied."
    },
    "replicate_weights": {
      "type": "string",
      "title": "Replicate Weights",
      "nullable": true,
      "description": "Load LoRA weights from Replicate training. Only works with text to image pipeline."
    },
    "seed": {
      "type": "integer",
      "title": "Seed",
      "nullable": true,
      "description": "Random seed. Set for reproducible generation"
    },
    "disable_safety_checker": {
      "type": "boolean",
      "title": "Disable Safety Checker",
      "default": false,
      "description": "Disable safety checker for generated images."
    }
  }
}
```

#### Genfeed Mapping

```typescript
import { calculateAspectRatio, getDefaultAspectRatio } from '@genfeedai/helpers';

// From PromptBuilderParams to Qwen Image schema
{
  prompt: JsonPromptBuilder.stringify(jsonPrompt),  // Structured prompt
  aspect_ratio: calculateAspectRatio(params.width, params.height) || getDefaultAspectRatio(model),
  guidance: params.guidance ?? 3,
  num_inference_steps: params.numInferenceSteps ?? 30,
  go_fast: params.goFast ?? true,
  output_format: params.outputFormat ?? 'jpg',
  output_quality: params.outputQuality ?? 80,
  enhance_prompt: params.enhancePrompt ?? false,
  negative_prompt: negativePrompt || ' ',
  disable_safety_checker: params.disableSafetyChecker ?? false,
  seed: params.seed,  // Optional, only added if provided

  // Img2img pipeline support
  image: params.references?.[0],  // Single reference image
  strength: params.strength ?? 0.9,  // Only used when image provided

  // LoRA weights support (text-to-image only)
  lora_weights: params.loraWeights,  // Optional custom LoRA
  lora_scale: params.loraScale ?? 1,  // LoRA application strength
  replicate_weights: params.replicateWeights  // Optional Replicate-trained LoRA
}
```

**Smart Defaults:**

- `guidance: 3` (balanced, good values: 2-3.5 for realism)
- `num_inference_steps: 30` (good quality/speed balance, range 28-50)
- `go_fast: true` (enable optimizations for faster generation)
- `output_format: 'jpg'` (efficient file size)
- `output_quality: 80` (good balance of quality and file size)
- `enhance_prompt: false` (manual prompt control)
- `strength: 0.9` (when using img2img, high influence from input)
- Supports both text-to-image and img2img pipelines
- LoRA weights can be loaded from URLs or Replicate training
- Negative prompts supported for better control

---

### RunwayML Gen4 Image Turbo

**Model ID:** `runwayml/gen4-image-turbo`
**Purpose:** Fast image generation with reference image tagging system
**Category:** Image Generation

#### Official Replicate Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "gen4-image-turbo Input Schema",
  "description": "Official Replicate API schema for runwayml/gen4-image-turbo",
  "required": ["prompt"],
  "properties": {
    "seed": {
      "type": "integer",
      "title": "Seed",
      "nullable": true,
      "description": "Random seed. Set for reproducible generation"
    },
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "description": "Text prompt for image generation"
    },
    "resolution": {
      "enum": ["720p", "1080p"],
      "type": "string",
      "title": "resolution",
      "description": "An enumeration."
    },
    "aspect_ratio": {
      "enum": ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"],
      "type": "string",
      "title": "aspect_ratio",
      "description": "An enumeration."
    },
    "reference_tags": {
      "type": "array",
      "items": { "type": "string" },
      "title": "Reference Tags",
      "default": [],
      "description": "An optional tag for each of your reference images. Tags must be alphanumeric and start with a letter. You can reference them in your prompt using @tag_name. Tags must be between 3 and 15 characters."
    },
    "reference_images": {
      "type": "array",
      "items": { "type": "string", "format": "uri" },
      "title": "Reference Images",
      "default": [],
      "description": "You must give at least one reference image. Up to 3 reference images are supported. Images must be between 0.5 and 2 aspect ratio."
    }
  }
}
```

#### Genfeed Mapping

```typescript
import { calculateAspectRatio, getDefaultAspectRatio } from '@genfeedai/helpers';

// From PromptBuilderParams to Gen4 Image Turbo schema
{
  prompt: JsonPromptBuilder.stringify(jsonPrompt),  // Structured prompt
  aspect_ratio: calculateAspectRatio(params.width, params.height) || getDefaultAspectRatio(model),
  resolution: params.resolution ?? '1080p',
  seed: params.seed,  // Optional, only added if provided

  // Reference images support (up to 3 images)
  reference_images: params.references?.slice(0, 3),  // Array of image URLs
  reference_tags: params.referenceTags?.slice(0, 3),  // Optional tags for referencing in prompt
}
```

**Smart Defaults:**

- `resolution: '1080p'` (highest quality)
- `aspect_ratio: '1:1'` (square, versatile default)
- Supports up to 3 reference images
- Reference tags allow @tag_name mentions in prompts (alphanumeric, 3-15 chars)
- Images must be between 0.5 and 2 aspect ratio

---

### Google Imagen 3 / 3 Fast / 4 / 4 Fast / 4 Ultra

**Model IDs:**

- `google/imagen-3`
- `google/imagen-3-fast`
- `google/imagen-4`
- `google/imagen-4-fast`
- `google/imagen-4-ultra`

**Purpose:** High-quality photorealistic image generation
**Category:** Image Generation

#### Official Replicate Schema

```json
{
  "type": "object",
  "title": "Input",
  "required": ["prompt"],
  "properties": {
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "x-order": 0,
      "description": "Text prompt for image generation"
    },
    "aspect_ratio": {
      "enum": ["1:1", "9:16", "16:9", "3:4", "4:3"],
      "type": "string",
      "title": "aspect_ratio",
      "description": "Aspect ratio of the generated image",
      "default": "1:1",
      "x-order": 1
    },
    "safety_filter_level": {
      "enum": [
        "block_low_and_above",
        "block_medium_and_above",
        "block_only_high"
      ],
      "type": "string",
      "title": "safety_filter_level",
      "description": "block_low_and_above is strictest, block_medium_and_above blocks some prompts, block_only_high is most permissive but some prompts will still be blocked",
      "default": "block_only_high",
      "x-order": 2
    },
    "output_format": {
      "enum": ["jpg", "png"],
      "type": "string",
      "title": "output_format",
      "description": "Format of the output image",
      "default": "jpg",
      "x-order": 3
    }
  }
}
```

#### Genfeed Mapping

```typescript
{
  prompt: JsonPromptBuilder.stringify(jsonPrompt),
  aspect_ratio: calculateAspectRatio(params.width, params.height) || '1:1',
  safety_filter_level: 'block_only_high',
  output_format: 'jpg'
}
```

---

### Google Veo 2

**Model ID:** `google/veo-2`
**Purpose:** Text-to-video generation
**Category:** Video Generation

#### Official Replicate Schema

```json
{
  "type": "object",
  "title": "Input",
  "required": ["prompt"],
  "properties": {
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "description": "A text description of the video you want to generate"
    },
    "image": {
      "type": "string",
      "format": "uri",
      "title": "Reference Image",
      "description": "Optional starting frame for video generation"
    },
    "aspect_ratio": {
      "enum": ["9:16", "16:9", "1:1"],
      "type": "string",
      "title": "Aspect Ratio",
      "default": "16:9"
    },
    "duration": {
      "type": "integer",
      "title": "Duration",
      "description": "Video duration in seconds (2-5)",
      "minimum": 2,
      "maximum": 5,
      "default": 5
    },
    "seed": {
      "type": "integer",
      "title": "Seed",
      "description": "Random seed for reproducibility (-1 for random)",
      "default": -1
    }
  }
}
```

#### Genfeed Mapping

```typescript
{
  prompt: JsonPromptBuilder.stringify(jsonPrompt),
  aspect_ratio: calculateAspectRatio(params.width, params.height),
  duration: params.duration ?? 5,
  seed: params.seed ?? -1,
  image: params.references?.[0]  // Optional reference image
}
```

---

### Google Veo 3 / 3 Fast

**Model IDs:**

- `google/veo-3`
- `google/veo-3-fast`

**Purpose:** Enhanced video generation with audio support
**Category:** Video Generation

#### Official Replicate Schema

```json
{
  "type": "object",
  "title": "Input",
  "required": ["prompt"],
  "properties": {
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "description": "A text description of the video you want to generate"
    },
    "negative_prompt": {
      "type": "string",
      "title": "Negative Prompt",
      "description": "What you don't want in the video"
    },
    "image": {
      "type": "string",
      "format": "uri",
      "title": "Reference Image",
      "description": "Optional starting frame for image-to-video"
    },
    "duration": {
      "type": "integer",
      "title": "Duration",
      "description": "Video duration in seconds (2-8)",
      "minimum": 2,
      "maximum": 8,
      "default": 8
    },
    "resolution": {
      "enum": ["720p", "1080p"],
      "type": "string",
      "title": "Resolution",
      "default": "720p"
    },
    "aspect_ratio": {
      "enum": ["9:16", "16:9", "1:1"],
      "type": "string",
      "title": "Aspect Ratio",
      "default": "16:9"
    },
    "generate_audio": {
      "type": "boolean",
      "title": "Generate Audio",
      "description": "Whether to generate audio for the video",
      "default": true
    },
    "seed": {
      "type": "integer",
      "title": "Seed",
      "default": -1
    }
  }
}
```

#### Genfeed Mapping

```typescript
{
  prompt: JsonPromptBuilder.stringify(jsonPrompt),
  negative_prompt: this.getNegativePrompt(params.blacklist),
  duration: params.duration ?? 8,
  resolution: params.resolution ?? '720p',
  aspect_ratio: calculateAspectRatio(params.width, params.height),
  generate_audio: params.isAudioEnabled ?? true,
  seed: params.seed ?? -1,
  image: params.references?.[0]  // Optional for I2V
}
```

---

### Google Veo 3.1 / 3.1 Fast

**Model IDs:**

- `google/veo-3.1`
- `google/veo-3.1-fast`

**Purpose:** Latest video generation with I2V, R2V (reference-to-video), and interpolation
**Category:** Video Generation

#### Official Replicate Schema

```json
{
  "type": "object",
  "title": "Input",
  "required": ["prompt"],
  "properties": {
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "description": "A text description of the video you want to generate"
    },
    "negative_prompt": {
      "type": "string",
      "title": "Negative Prompt"
    },
    "image": {
      "type": "string",
      "format": "uri",
      "title": "Starting Frame",
      "description": "First frame for image-to-video"
    },
    "last_frame": {
      "type": "string",
      "format": "uri",
      "title": "Last Frame",
      "description": "Last frame for video interpolation (requires image)"
    },
    "reference_images": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "uri"
      },
      "title": "Reference Images",
      "description": "2-3 reference images for R2V mode (16:9 and 8s only)",
      "minItems": 2,
      "maxItems": 3
    },
    "duration": {
      "type": "integer",
      "title": "Duration",
      "description": "Video duration in seconds (2-8)",
      "minimum": 2,
      "maximum": 8,
      "default": 8
    },
    "resolution": {
      "enum": ["720p", "1080p"],
      "type": "string",
      "title": "Resolution",
      "default": "1080p"
    },
    "aspect_ratio": {
      "enum": ["9:16", "16:9", "1:1"],
      "type": "string",
      "title": "Aspect Ratio",
      "default": "16:9"
    },
    "generate_audio": {
      "type": "boolean",
      "title": "Generate Audio",
      "default": true
    },
    "seed": {
      "type": "integer",
      "title": "Seed"
    }
  }
}
```

#### Genfeed Mapping

```typescript
{
  prompt: JsonPromptBuilder.stringify(jsonPrompt),
  negative_prompt: this.getNegativePrompt(params.blacklist),
  resolution: params.resolution ?? '1080p',
  aspect_ratio: calculateAspectRatio(params.width, params.height),
  duration: params.duration ?? 8,
  generate_audio: params.isAudioEnabled ?? true,
  seed: params.seed,  // Only if provided

  // Mode detection (priority: R2V > I2V+interpolation > I2V > T2V)
  ...(params.references?.length > 1
    ? { reference_images: params.references.slice(0, 3) }  // R2V mode
    : params.references?.[0]
      ? {
          image: params.references[0],  // I2V mode
          ...(params.endFrame && { last_frame: params.endFrame })  // Optional interpolation
        }
      : {}  // T2V mode
  )
}
```

**Modes Supported:**

- **T2V (Text-to-Video):** Only prompt provided
- **I2V (Image-to-Video):** Single `image` provided as starting frame
- **I2V + Interpolation:** Both `image` and `last_frame` provided
- **R2V (Reference-to-Video):** 2-3 `reference_images` provided (16:9 + 8s only)

---

### OpenAI Sora 2

**Model ID:** `openai/sora-2`
**Purpose:** Video generation with synced audio from OpenAI
**Category:** Video Generation

#### Official Replicate Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "OpenAI Sora 2 Input Schema",
  "description": "Official Replicate API schema for OpenAI Sora 2 video generation with synced audio",
  "required": ["prompt"],
  "properties": {
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "x-order": 0,
      "description": "A text description of the video you want to generate"
    },
    "image": {
      "type": "string",
      "title": "Image",
      "format": "uri",
      "x-order": 1,
      "nullable": true,
      "description": "Input image to start generating from (optional)"
    },
    "aspect_ratio": {
      "type": "string",
      "title": "Aspect Ratio",
      "x-order": 2,
      "nullable": true,
      "description": "Aspect ratio of the generated video"
    },
    "duration": {
      "type": "number",
      "title": "Duration",
      "x-order": 3,
      "nullable": true,
      "description": "Video duration in seconds"
    },
    "seed": {
      "type": "integer",
      "title": "Seed",
      "x-order": 4,
      "nullable": true,
      "description": "Random seed. Omit for random generations"
    }
  }
}
```

#### Genfeed Mapping

```typescript
{
  prompt: JsonPromptBuilder.stringify(jsonPrompt),
  aspect_ratio: calculateAspectRatio(params.width, params.height),
  duration: params.duration,
  seed: params.seed,
  image: params.references?.[0]  // Optional reference image
}
```

**Smart Defaults:**

- If no duration provided → Use model default
- If no seed provided → Omit for random generation
- Aspect ratio calculated from width/height if provided

---

### OpenAI Sora 2 Pro

**Model ID:** `openai/sora-2-pro`
**Purpose:** Most advanced synced-audio video generation from OpenAI
**Category:** Video Generation

#### Official Replicate Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "OpenAI Sora 2 Pro Input Schema",
  "description": "Official Replicate API schema for OpenAI Sora 2 Pro - most advanced synced-audio video generation",
  "required": ["prompt"],
  "properties": {
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "x-order": 0,
      "description": "A text description of the video you want to generate"
    },
    "image": {
      "type": "string",
      "title": "Image",
      "format": "uri",
      "x-order": 1,
      "nullable": true,
      "description": "Input image to start generating from (optional)"
    },
    "aspect_ratio": {
      "type": "string",
      "title": "Aspect Ratio",
      "x-order": 2,
      "nullable": true,
      "description": "Aspect ratio of the generated video"
    },
    "duration": {
      "type": "number",
      "title": "Duration",
      "x-order": 3,
      "nullable": true,
      "description": "Video duration in seconds"
    },
    "seed": {
      "type": "integer",
      "title": "Seed",
      "x-order": 4,
      "nullable": true,
      "description": "Random seed. Omit for random generations"
    }
  }
}
```

#### Genfeed Mapping

```typescript
{
  prompt: JsonPromptBuilder.stringify(jsonPrompt),
  aspect_ratio: calculateAspectRatio(params.width, params.height),
  duration: params.duration,
  seed: params.seed,
  image: params.references?.[0]  // Optional reference image
}
```

**Smart Defaults:**

- If no duration provided → Use model default
- If no seed provided → Omit for random generation
- Aspect ratio calculated from width/height if provided

---

### WAN Video 2.2 I2V Fast

**Model ID:** `wan-video/wan-2.2-i2v-fast`
**Purpose:** Fast image-to-video generation
**Category:** Video Generation

#### Official Replicate Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "wan-2.2-i2v-fast Input Schema",
  "description": "Official Replicate API schema for wan-video/wan-2.2-i2v-fast",
  "required": ["prompt", "image"],
  "properties": {
    "seed": {
      "type": "integer",
      "title": "Seed",
      "x-order": 8,
      "nullable": true,
      "description": "Random seed. Leave blank for random"
    },
    "image": {
      "type": "string",
      "title": "Image",
      "format": "uri",
      "x-order": 1,
      "description": "Input image to generate video from."
    },
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "x-order": 0,
      "description": "Prompt for video generation"
    },
    "go_fast": {
      "type": "boolean",
      "title": "Go Fast",
      "default": true,
      "x-order": 6,
      "description": "Go fast"
    },
    "num_frames": {
      "type": "integer",
      "title": "Num Frames",
      "default": 81,
      "maximum": 121,
      "minimum": 81,
      "x-order": 2,
      "description": "Number of video frames. 81 frames give the best results"
    },
    "resolution": {
      "enum": ["480p", "720p"],
      "type": "string",
      "title": "resolution",
      "description": "An enumeration."
    },
    "aspect_ratio": {
      "enum": ["16:9", "9:16"],
      "type": "string",
      "title": "aspect_ratio",
      "description": "An enumeration."
    },
    "sample_shift": {
      "type": "number",
      "title": "Sample Shift",
      "default": 12,
      "maximum": 20,
      "minimum": 1,
      "x-order": 7,
      "description": "Sample shift factor"
    },
    "frames_per_second": {
      "type": "integer",
      "title": "Frames Per Second",
      "default": 16,
      "maximum": 30,
      "minimum": 5,
      "x-order": 5,
      "description": "Frames per second. Note that the pricing of this model is based on the video duration at 16 fps"
    },
    "disable_safety_checker": {
      "type": "boolean",
      "title": "Disable Safety Checker",
      "default": false,
      "x-order": 9,
      "description": "Disable safety checker for generated video."
    }
  }
}
```

#### Genfeed Mapping

```typescript
{
  prompt: JsonPromptBuilder.stringify(jsonPrompt),
  image: params.references?.[0],  // Required - input image for I2V
  aspect_ratio: normalizeAspectRatioForModel(
    model,
    calculateAspectRatio(params.width, params.height)
  ),
  resolution: params.resolution ?? '720p',
  num_frames: params.numFrames ?? 81,
  frames_per_second: params.framesPerSecond ?? 16,
  go_fast: params.goFast ?? true,
  sample_shift: params.sampleShift ?? 12,
  disable_safety_checker: params.disableSafetyChecker ?? false,
  seed: params.seed  // Optional, only included if provided
}
```

**Smart Defaults:**

- Required `image` field (this is an image-to-video model)
- Only supports "16:9" and "9:16" aspect ratios (normalized automatically)
- Default resolution: 720p
- Default frames: 81 (recommended for best results)
- Default FPS: 16 (pricing based on this)
- Fast mode enabled by default (`go_fast: true`)
- Seed only included if explicitly provided

---

### Kwaivgi Kling V1.6 Pro

**Model ID:** `kwaivgi/kling-v1.6-pro`
**Purpose:** Video generation with optional I2V, interpolation, and reference images
**Category:** Video Generation

#### Official Replicate Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "kling-v1.6-pro Input Schema",
  "description": "Official Replicate API schema for kwaivgi/kling-v1.6-pro",
  "required": ["prompt"],
  "properties": {
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "description": "Text prompt for video generation"
    },
    "duration": {
      "enum": [5, 10],
      "type": "integer",
      "title": "duration",
      "description": "An enumeration."
    },
    "cfg_scale": {
      "type": "number",
      "title": "Cfg Scale",
      "default": 0.5,
      "maximum": 1,
      "minimum": 0,
      "description": "Flexibility in video generation; The higher the value, the lower the model's degree of flexibility, and the stronger the relevance to the user's prompt."
    },
    "end_image": {
      "type": "string",
      "title": "End Image",
      "format": "uri",
      "description": "Last frame of the video. A start or end image is required."
    },
    "start_image": {
      "type": "string",
      "title": "Start Image",
      "format": "uri",
      "description": "First frame of the video. A start or end image is required."
    },
    "aspect_ratio": {
      "enum": ["16:9", "9:16", "1:1"],
      "type": "string",
      "title": "aspect_ratio",
      "description": "An enumeration."
    },
    "negative_prompt": {
      "type": "string",
      "title": "Negative Prompt",
      "default": "",
      "description": "Things you do not want to see in the video"
    },
    "reference_images": {
      "type": "array",
      "items": {
        "type": "string",
        "format": "uri"
      },
      "title": "Reference Images",
      "description": "Reference images to use in video generation (up to 4 images). Also known as scene elements."
    }
  }
}
```

#### Genfeed Mapping

```typescript
{
  prompt: JsonPromptBuilder.stringify(jsonPrompt),
  aspect_ratio: normalizeAspectRatioForModel(
    model,
    calculateAspectRatio(params.width, params.height)
  ),
  duration: params.duration ?? 5,  // Must be 5 or 10 seconds
  negative_prompt: negativePrompt,
  cfg_scale: params.cfgScale ?? 0.5,  // 0-1, default 0.5
  start_image: params.references?.[0],  // Optional for I2V mode
  end_image: params.endFrame,  // Optional for interpolation
  reference_images: params.references?.slice(1, 5)  // Up to 4 reference images for scene elements
}
```

**Smart Defaults:**

- Duration: 5 seconds (valid options: 5 or 10 seconds)
- Supports "16:9", "9:16", and "1:1" aspect ratios
- CFG Scale: 0.5 (valid range: 0-1)
- At least one of `start_image` or `end_image` is required
- Optional `reference_images` array (up to 4 images) for scene elements
- Negative prompt support for better control over generation

**Modes Supported:**

- **T2V (Text-to-Video):** Only prompt provided (requires at least start_image or end_image)
- **I2V (Image-to-Video):** `start_image` provided as first frame
- **Interpolation:** Both `start_image` and `end_image` provided for video interpolation
- **Reference Images:** Additional `reference_images` array (up to 4) for scene elements

**Key Features:**

- Supports video interpolation between start and end frames
- Reference images array for scene elements (separate from start/end images)
- CFG scale control for prompt adherence
- Aspect ratio selection (16:9, 9:16, 1:1)

---

### Kwaivgi Kling V2.1

**Model ID:** `kwaivgi/kling-v2.1`
**Purpose:** Image-to-video generation (I2V only, requires start_image)
**Category:** Video Generation

#### Official Replicate Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "kling-v2.1 Input Schema",
  "description": "Official Replicate API schema for kwaivgi/kling-v2.1",
  "required": ["prompt", "start_image"],
  "properties": {
    "mode": {
      "enum": ["standard", "pro"],
      "type": "string",
      "title": "mode",
      "description": "An enumeration."
    },
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "description": "Text prompt for video generation"
    },
    "duration": {
      "enum": [5, 10],
      "type": "integer",
      "title": "duration",
      "description": "An enumeration."
    },
    "end_image": {
      "type": "string",
      "title": "End Image",
      "format": "uri",
      "nullable": true,
      "description": "Last frame of the video (pro mode is required when this parameter is set)"
    },
    "start_image": {
      "type": "string",
      "title": "Start Image",
      "format": "uri",
      "description": "First frame of the video. You must use a start image with kling-v2.1."
    },
    "negative_prompt": {
      "type": "string",
      "title": "Negative Prompt",
      "default": "",
      "description": "Things you do not want to see in the video"
    }
  }
}
```

#### Genfeed Mapping

```typescript
// Implementation in replicate-prompt.builder.ts
{
  prompt: promptText,
  start_image: params.references[0], // REQUIRED - I2V only model
  duration: params.duration && [5, 10].includes(params.duration) ? params.duration : 5,
  mode: params.endFrame ? 'pro' : 'standard', // pro mode required for end_image
  negative_prompt: negativePrompt,
  end_image: params.endFrame // Optional, requires pro mode
}
```

**Key Features:**

- Image-to-video (I2V) generation only - `start_image` is REQUIRED
- Duration: 5 or 10 seconds (strictly enforced)
- Mode: standard or pro (pro mode required for `end_image`)
- End frame support via `end_image` parameter (requires pro mode)
- Negative prompt support
- Generates 5s and 10s videos in 720p and 1080p resolution
- No aspect ratio parameter (unlike v2.1-master)

**Important Notes:**

- This model is I2V-only and requires a `start_image` reference
- If `end_image` (via `endFrame` param) is provided, mode is automatically set to 'pro'
- Unlike `kwaivgi/kling-v2.1-master`, this model does not support aspect ratio selection

---

### Kwaivgi Kling V2.1 Master

**Model ID:** `kwaivgi/kling-v2.1-master`
**Purpose:** Video generation with optional image-to-video (I2V) mode
**Category:** Video Generation

#### Official Replicate Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "kling-v2.1-master Input Schema",
  "description": "Official Replicate API schema for kwaivgi/kling-v2.1-master",
  "required": ["prompt"],
  "properties": {
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "description": "Text prompt for video generation"
    },
    "duration": {
      "enum": [5, 10],
      "type": "integer",
      "title": "duration",
      "description": "An enumeration."
    },
    "start_image": {
      "type": "string",
      "title": "Start Image",
      "format": "uri",
      "description": "First frame of the video"
    },
    "aspect_ratio": {
      "enum": ["16:9", "9:16", "1:1"],
      "type": "string",
      "title": "aspect_ratio",
      "description": "An enumeration."
    },
    "negative_prompt": {
      "type": "string",
      "title": "Negative Prompt",
      "default": "",
      "description": "Things you do not want to see in the video"
    }
  }
}
```

#### Genfeed Mapping

```typescript
// Implementation in replicate-prompt.builder.ts:1312-1349
{
  prompt: promptText,
  aspect_ratio: normalizeAspectRatioForModel(model, calculatedRatio),
  duration: params.duration && [5, 10].includes(params.duration) ? params.duration : 5,
  negative_prompt: negativePrompt,
  start_image: params.references?.[0] // I2V mode
}
```

**Key Features:**

- Text-to-video (T2V) generation
- Image-to-video (I2V) mode via `start_image` parameter
- Duration: 5 or 10 seconds (strictly enforced)
- Aspect ratios: 16:9, 9:16, 1:1
- Negative prompt support
- High-quality video output

---

### Kwaivgi Kling V2.5 Turbo Pro

**Model ID:** `kwaivgi/kling-v2.5-turbo-pro`
**Purpose:** Fast video generation with optional image-to-video support
**Category:** Video Generation

#### Official Replicate Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "title": "kling-v2.5-turbo-pro Input Schema",
  "description": "Official Replicate API schema for kwaivgi/kling-v2.5-turbo-pro",
  "required": ["prompt"],
  "properties": {
    "image": {
      "type": "string",
      "title": "Image",
      "format": "uri",
      "nullable": true,
      "deprecated": true,
      "description": "Deprecated: Use start_image instead."
    },
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "description": "Text prompt for video generation"
    },
    "duration": {
      "enum": [5, 10],
      "type": "integer",
      "title": "duration",
      "description": "An enumeration."
    },
    "start_image": {
      "type": "string",
      "title": "Start Image",
      "format": "uri",
      "description": "First frame of the video"
    },
    "aspect_ratio": {
      "enum": ["16:9", "9:16", "1:1"],
      "type": "string",
      "title": "aspect_ratio",
      "description": "An enumeration."
    },
    "negative_prompt": {
      "type": "string",
      "title": "Negative Prompt",
      "default": "",
      "description": "Things you do not want to see in the video"
    }
  }
}
```

#### Genfeed Mapping

```typescript
{
  prompt: JsonPromptBuilder.stringify(jsonPrompt),
  aspect_ratio: normalizeAspectRatioForModel(
    model,
    calculateAspectRatio(params.width, params.height)
  ),
  duration: params.duration ?? 5,  // Must be 5 or 10 seconds
  negative_prompt: negativePrompt,
  start_image: params.references?.[0]  // Optional for I2V mode
}
```

**Smart Defaults:**

- Duration: 5 seconds (valid options: 5 or 10 seconds)
- Supports "16:9", "9:16", and "1:1" aspect ratios
- Optional `start_image` for image-to-video mode
- `image` field is deprecated, use `start_image` instead
- Negative prompt support for better control over generation

**Modes Supported:**

- **T2V (Text-to-Video):** Only prompt provided
- **I2V (Image-to-Video):** `start_image` provided as first frame

---

### Luma Reframe Image

**Model ID:** `luma/reframe-image`
**Purpose:** Change aspect ratio of existing images
**Category:** Image Transformation

#### Official Replicate Schema

```json
{
  "type": "object",
  "title": "Input",
  "required": ["image_url"],
  "properties": {
    "model": {
      "enum": ["photon-flash-1"],
      "type": "string",
      "title": "Model",
      "default": "photon-flash-1"
    },
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "description": "Optional prompt to guide transformation"
    },
    "image_url": {
      "type": "string",
      "format": "uri",
      "title": "Image URL",
      "description": "URL of the image to reframe"
    },
    "aspect_ratio": {
      "enum": ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9", "9:21"],
      "type": "string",
      "title": "Aspect Ratio",
      "default": "9:16"
    }
  }
}
```

#### Genfeed Mapping

```typescript
{
  model: 'photon-flash-1',
  prompt: JsonPromptBuilder.stringify(jsonPrompt),
  image_url: params.references?.[0],
  aspect_ratio: calculateAspectRatio(params.width, params.height) || '9:16'
}
```

---

### Luma Reframe Video

**Model ID:** `luma/reframe-video`
**Purpose:** Change aspect ratio of existing videos
**Category:** Video Transformation

#### Official Replicate Schema

```json
{
  "type": "object",
  "title": "Input",
  "required": ["video_url"],
  "properties": {
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "description": "Optional prompt to guide transformation"
    },
    "video_url": {
      "type": "string",
      "format": "uri",
      "title": "Video URL",
      "description": "URL of the video to reframe"
    },
    "aspect_ratio": {
      "enum": ["1:1", "4:3", "3:4", "16:9", "9:16"],
      "type": "string",
      "title": "Aspect Ratio",
      "default": "9:16"
    }
  }
}
```

#### Genfeed Mapping

```typescript
{
  prompt: JsonPromptBuilder.stringify(jsonPrompt),
  video_url: params.video || params.references?.[0],
  aspect_ratio: calculateAspectRatio(params.width, params.height) || '9:16'
}
```

---

### Topaz Video Upscale

**Model ID:** `topazlabs/video-upscale`
**Purpose:** AI-powered video upscaling and enhancement
**Category:** Video Enhancement

#### Official Replicate Schema

```json
{
  "type": "object",
  "title": "Input",
  "required": ["video"],
  "properties": {
    "video": {
      "type": "string",
      "format": "uri",
      "title": "Video",
      "description": "Input video to upscale"
    },
    "target_fps": {
      "type": "integer",
      "title": "Target FPS",
      "description": "Target frames per second"
    },
    "target_resolution": {
      "enum": ["720p", "1080p", "4k"],
      "type": "string",
      "title": "Target Resolution",
      "description": "Target resolution for upscaling"
    }
  }
}
```

#### Genfeed Mapping

```typescript
{
  video: params.video,
  target_fps: params.target_fps,
  target_resolution: params.target_resolution
}
```

---

### Meta MusicGen

**Model ID:** `meta/musicgen`
**Purpose:** AI music generation from text prompts
**Category:** Audio Generation

#### Official Replicate Schema

```json
{
  "type": "object",
  "title": "Input",
  "required": ["prompt"],
  "properties": {
    "prompt": {
      "type": "string",
      "title": "Prompt",
      "description": "A text description of the music you want to generate"
    },
    "model_version": {
      "enum": ["stereo-large", "stereo-medium", "mono-large", "mono-medium"],
      "type": "string",
      "title": "Model Version",
      "default": "stereo-large"
    },
    "duration": {
      "type": "integer",
      "title": "Duration",
      "description": "Duration in seconds (1-30)",
      "minimum": 1,
      "maximum": 30,
      "default": 8
    },
    "continuation": {
      "type": "boolean",
      "title": "Continuation",
      "description": "Continue from previous generation",
      "default": false
    },
    "continuation_start": {
      "type": "integer",
      "title": "Continuation Start",
      "description": "Start time for continuation in seconds",
      "default": 0
    },
    "normalization_strategy": {
      "enum": ["loudness", "clip", "peak", "rms"],
      "type": "string",
      "title": "Normalization Strategy",
      "default": "loudness"
    },
    "top_k": {
      "type": "integer",
      "title": "Top K",
      "description": "Top-k sampling parameter",
      "default": 250
    },
    "top_p": {
      "type": "number",
      "title": "Top P",
      "description": "Top-p (nucleus) sampling parameter",
      "default": 0
    },
    "temperature": {
      "type": "number",
      "title": "Temperature",
      "description": "Sampling temperature",
      "default": 1
    },
    "classifier_free_guidance": {
      "type": "number",
      "title": "Classifier Free Guidance",
      "description": "CFG scale",
      "default": 3
    },
    "output_format": {
      "enum": ["mp3", "wav"],
      "type": "string",
      "title": "Output Format",
      "default": "mp3"
    },
    "seed": {
      "type": "integer",
      "title": "Seed",
      "default": -1
    }
  }
}
```

#### Genfeed Mapping

```typescript
{
  model_version: 'stereo-large',
  prompt: JsonPromptBuilder.stringify(jsonPrompt),
  duration: params.duration ?? 8,
  continuation: false,
  continuation_start: 0,
  normalization_strategy: 'loudness',
  top_k: 250,
  top_p: 0,
  temperature: 1,
  classifier_free_guidance: 3,
  output_format: 'mp3',
  seed: params.seed ?? -1
}
```

---

## Universal Parameter System

Genfeed uses a universal `PromptBuilderParams` interface that maps to model-specific schemas:

```typescript
interface PromptBuilderParams {
  // Core
  prompt: string;

  // Creative elements
  mood?: string;
  style?: string;
  camera?: string;
  scene?: string;
  sounds?: string[];
  speech?: string;

  // Dimensions
  width?: number;
  height?: number;

  // Generation
  duration?: number;
  seed?: number;
  outputs?: number;
  resolution?: string;

  // References
  references?: string[]; // Images/videos for reference
  endFrame?: string; // For interpolation
  video?: string; // For video transformations

  // Branding
  isBrandingEnabled?: boolean;
  isAudioEnabled?: boolean;
  account?: BrandEntity;

  // Filtering
  blacklist?: string[]; // Negative prompt keywords

  // Model-specific
  target_fps?: number;
  target_resolution?: string;

  // Metadata
  tags?: string[];
}
```

### JSON Prompt Builder

The `JsonPromptBuilder` converts universal parameters into structured prompts:

```typescript
{
  text: "base prompt text",
  elements: {
    mood: "cinematic",
    style: "photorealistic",
    camera: "wide angle",
    scene: "sunset beach",
    sounds: ["waves", "seagulls"],
    speech: "narration text",
    account: {
      label: "Brand Name",
      text: "Tagline",
      primaryColor: "#FF0000",
      secondaryColor: "#0000FF"
    }
  }
}
```

This structured format is then stringified and sent to models as the `prompt` parameter.

---

## Implementation Reference

### File Structure

```
services/integrations/replicate/
├── README.md                              # This file
├── schemas/                               # JSON schema definitions
│   ├── nano-banana.schema.json
│   ├── imagen-4.schema.json
│   ├── veo-3.schema.json
│   └── ...
├── helpers/
│   └── replicate.interface.ts            # TypeScript interfaces
└── replicate.service.ts                  # Main service

services/prompt-builder/
├── builders/
│   └── replicate-prompt.builder.ts       # Schema mapping logic
├── interfaces/
│   └── prompt-builder-params.interface.ts # Universal params
└── utils/
    ├── json-prompt.builder.ts            # JSON prompt formatting
    └── (shared helpers)               # Ratio calculation via @genfeedai/helpers
```

### Key Files

- **Schema Mappings:** [replicate-prompt.builder.ts](../../../prompt-builder/builders/replicate-prompt.builder.ts)
- **Universal Interface:** [prompt-builder-params.interface.ts](../../../prompt-builder/interfaces/prompt-builder-params.interface.ts)
- **Model Enums:** `@genfeedai/enums` package ([model.enum.ts](../../../../../../packages.genfeed.ai/packages/common/enums/src/model.enum.ts))

---

## Usage Examples

### Example 1: Image Generation with Nano Banana

```typescript
const params: PromptBuilderParams = {
  prompt: "Transform this portrait into anime style",
  width: 1920,
  height: 1080,
  references: ["https://example.com/portrait.jpg"],
  style: "anime",
  mood: "vibrant"
};

const input = replicatePromptBuilder.buildPrompt(
  ModelKey.REPLICATE_GOOGLE_NANO_BANANA,
  params
);

// Result sent to Replicate:
{
  prompt: "{text: 'Transform this portrait into anime style', elements: {style: 'anime', mood: 'vibrant'}}",
  image_input: ["https://example.com/portrait.jpg"],
  aspect_ratio: "16:9",
  output_format: "jpg"
}
```

### Example 2: Video Generation with Veo 3.1 R2V Mode

```typescript
const params: PromptBuilderParams = {
  prompt: "A cinematic scene transitioning through these moments",
  references: [
    "https://example.com/frame1.jpg",
    "https://example.com/frame2.jpg",
    "https://example.com/frame3.jpg"
  ],
  width: 1920,
  height: 1080,
  duration: 8,
  camera: "cinematic",
  isAudioEnabled: true
};

const input = replicatePromptBuilder.buildPrompt(
  ModelKey.REPLICATE_GOOGLE_VEO_3_1,
  params
);

// Result sent to Replicate (R2V mode):
{
  prompt: "{text: '...', elements: {camera: 'cinematic'}}",
  reference_images: [
    "https://example.com/frame1.jpg",
    "https://example.com/frame2.jpg",
    "https://example.com/frame3.jpg"
  ],
  aspect_ratio: "16:9",
  duration: 8,
  resolution: "1080p",
  generate_audio: true
}
```

### Example 3: Video Interpolation with Veo 3.1

```typescript
const params: PromptBuilderParams = {
  prompt: "Smooth transition between frames",
  references: ["https://example.com/start-frame.jpg"],
  endFrame: "https://example.com/end-frame.jpg",
  duration: 4,
  resolution: "1080p"
};

const input = replicatePromptBuilder.buildPrompt(
  ModelKey.REPLICATE_GOOGLE_VEO_3_1,
  params
);

// Result sent to Replicate (I2V + interpolation):
{
  prompt: "...",
  image: "https://example.com/start-frame.jpg",
  last_frame: "https://example.com/end-frame.jpg",
  aspect_ratio: "16:9",
  duration: 4,
  resolution: "1080p",
  generate_audio: true
}
```

---

## Testing

All model mappings are tested in:

- `services/prompt-builder/builders/replicate-prompt.builder.spec.ts`

Run tests:

```bash
npm test -- replicate-prompt.builder.spec.ts
```

---

## Adding New Models

When adding a new Replicate model:

1. **Get Official Schema:** Fetch from Replicate API or docs
2. **Create Schema File:** Add to `schemas/[model-name].schema.json`
3. **Update Enum:** Add to `ModelKey` enum in `packages/common/enums/src/model.enum.ts`
4. **Add Mapping:** Implement in `replicate-prompt.builder.ts`
5. **Document:** Add section to this README
6. **Test:** Add test cases for the new model

---

## Related Documentation

- [Prompt Builder Service](../../../prompt-builder/README.md)
- [Model Router Service](../../../router/README.md)
- [Architecture: AI Model Integration](./../../../../../.agents/SYSTEM/ARCHITECTURE.md)

---

**Last Updated:** 2025-10-15
**Maintained By:** Backend Team

---

## Ideogram Character

**Model ID:** `ideogram-ai/ideogram-character`
**Purpose:** Character-consistent image generation with required character reference
**Category:** Image Generation

### Official Replicate Schema

See: `services/integrations/replicate/schemas/ideogram-character.schema.json`

**Key Properties:**

- `prompt` (required): Text prompt for image generation
- `character_reference_image` (required): Image URL for character reference - REQUIRED field for this model
- `aspect_ratio` (optional): 13 aspect ratios supported (1:3, 3:1, 1:2, 2:1, 9:16, 16:9, 10:16, 16:10, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 1:1)
- `resolution` (optional): 100+ preset resolutions from 512x1536 to 1536x640
- `style_type` (optional): Auto, Fiction, Realistic
- `rendering_speed` (optional): Default, Turbo, Quality
- `magic_prompt_option` (optional): Auto, On, Off (prompt enhancement)
- `image` (optional): Image URL for inpainting (requires mask)
- `mask` (optional): Mask URL for inpainting (black = inpaint, white = preserve)
- `seed` (optional): Random seed for reproducibility (max 2147483647)

### Genfeed Mapping

```typescript
// Implementation in replicate-prompt.builder.ts:355-406
{
  prompt: promptText,
  character_reference_image: params.characterReferenceImage || params.references?.[0], // REQUIRED
  aspect_ratio: calculateAspectRatio(params.width, params.height) || '1:1',
  magic_prompt_option: params.magicPromptOption ?? 'Auto',

  // Optional parameters
  seed: params.seed,
  resolution: params.resolution,
  style_type: params.styleType,              // Auto, Fiction, Realistic
  rendering_speed: params.renderingSpeed,    // Default, Turbo, Quality

  // Inpainting support (separate from character reference)
  image: params.image,
  mask: params.mask
}
```

**Key Features:**

- **Character consistency**: Maintains character appearance across generations
- **Required character reference**: Must provide a character reference image
- **Style types**: Auto, Fiction, Realistic (optimized for character work)
- **Rendering speeds**: Choose between quality and speed
- **Magic Prompt**: Automatic prompt enhancement
- **Inpainting support**: Separate from character reference
- **Flexible aspect ratios**: 13 options from portrait to landscape
- **100+ resolution presets**

**Important Notes:**

- `character_reference_image` is REQUIRED - generation will fail without it
- The character reference is separate from the inpainting `image` field
- Use `params.characterReferenceImage` or first reference image as fallback
- Best for generating consistent characters across multiple scenes

---

## Ideogram V3 Balanced

**Model ID:** `ideogram-ai/ideogram-v3-balanced`
**Purpose:** Balanced image generation with style presets and reference support
**Category:** Image Generation

### Official Replicate Schema

See: `services/integrations/replicate/schemas/ideogram-v3-balanced.schema.json`

**Key Properties:**

- `prompt` (required): Text prompt for image generation
- `aspect_ratio` (optional): 12 aspect ratios supported (1:3, 3:1, 1:2, 2:1, 9:16, 16:9, 10:16, 16:10, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 1:1)
- `resolution` (optional): 100+ preset resolutions from 512x1536 to 1536x640
- `style_type` (optional): None, Auto, General, Realistic, Design
- `style_preset` (optional): 80+ artistic styles (80s Illustration, 90s Nostalgia, Art Deco, Bauhaus, Cubism, Pop Art, Watercolor, etc.)
- `magic_prompt_option` (optional): Auto, On, Off (prompt enhancement)
- `style_reference_images` (optional): Array of image URLs for style references
- `image` (optional): Image URL for inpainting (requires mask)
- `mask` (optional): Mask URL for inpainting (black = inpaint, white = preserve)
- `seed` (optional): Random seed for reproducibility (max 2147483647)

### Genfeed Mapping

```typescript
// Implementation in replicate-prompt.builder.ts:410-463
{
  prompt: promptText,
  aspect_ratio: calculateAspectRatio(params.width, params.height) || '1:1',
  magic_prompt_option: params.magicPromptOption ?? 'Auto',

  // Optional parameters
  seed: params.seed,
  resolution: params.resolution,
  style_type: params.styleType,
  style_preset: params.stylePreset,
  style_reference_images: params.styleReferenceImages,

  // Inpainting support
  image: params.references?.[0],
  mask: params.mask
}
```

**Key Features:**

- Balanced mode (optimal speed/quality tradeoff)
- Extensive style presets (80+ artistic styles)
- Style types: Auto, General, Realistic, Design
- Magic Prompt for automatic prompt enhancement
- Multiple style reference images support
- Inpainting with mask support
- Flexible aspect ratios (12 options)
- 100+ resolution presets

---

## Ideogram V3 Quality

**Model ID:** `ideogram-ai/ideogram-v3-quality`
**Purpose:** High-quality image generation with extensive style presets and reference support
**Category:** Image Generation

### Official Replicate Schema

See: `services/integrations/replicate/schemas/ideogram-v3-quality.schema.json`

**Key Properties:**

- `prompt` (required): Text prompt for image generation
- `aspect_ratio` (optional): 12 aspect ratios supported (1:3, 3:1, 1:2, 2:1, 9:16, 16:9, 10:16, 16:10, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 1:1)
- `resolution` (optional): 100+ preset resolutions from 512x1536 to 1536x640
- `style_type` (optional): None, Auto, General, Realistic, Design
- `style_preset` (optional): 80+ artistic styles (80s Illustration, 90s Nostalgia, Art Deco, Bauhaus, Cubism, Pop Art, Watercolor, etc.)
- `magic_prompt_option` (optional): Auto, On, Off (prompt enhancement)
- `style_reference_images` (optional): Array of image URLs for style references
- `image` (optional): Image URL for inpainting (requires mask)
- `mask` (optional): Mask URL for inpainting (black = inpaint, white = preserve)
- `seed` (optional): Random seed for reproducibility (max 2147483647)

### Genfeed Mapping

```typescript
// Implementation in replicate-prompt.builder.ts:409-462
{
  prompt: promptText,
  aspect_ratio: calculateAspectRatio(params.width, params.height) || '1:1',
  magic_prompt_option: params.magicPromptOption ?? 'Auto',

  // Optional parameters
  seed: params.seed,
  resolution: params.resolution,
  style_type: params.styleType,
  style_preset: params.stylePreset,
  style_reference_images: params.styleReferenceImages,

  // Inpainting support
  image: params.references?.[0],
  mask: params.mask
}
```

**Key Features:**

- High-quality rendering mode (slower than Turbo, better quality)
- Extensive style presets (80+ artistic styles)
- Style types: Auto, General, Realistic, Design
- Magic Prompt for automatic prompt enhancement
- Multiple style reference images support
- Inpainting with mask support
- Flexible aspect ratios (12 options)
- 100+ resolution presets

---

## Ideogram V3 Turbo

**Model ID:** `ideogram-ai/ideogram-v3-turbo`
**Purpose:** Fast image generation with extensive style presets and reference support
**Category:** Image Generation

### Official Replicate Schema

See: `services/integrations/replicate/schemas/ideogram-v3-turbo.schema.json`

**Key Properties:**

- `prompt` (required): Text prompt for image generation
- `aspect_ratio` (optional): 12 aspect ratios supported (1:3, 3:1, 1:2, 2:1, 9:16, 16:9, 10:16, 16:10, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 1:1)
- `resolution` (optional): 100+ preset resolutions from 512x1536 to 1536x640
- `style_type` (optional): None, Auto, General, Realistic, Design
- `style_preset` (optional): 80+ artistic styles (80s Illustration, 90s Nostalgia, Art Deco, Bauhaus, Cubism, Pop Art, Watercolor, etc.)
- `magic_prompt_option` (optional): Auto, On, Off (prompt enhancement)
- `style_reference_images` (optional): Array of image URLs for style references
- `image` (optional): Image URL for inpainting (requires mask)
- `mask` (optional): Mask URL for inpainting (black = inpaint, white = preserve)
- `seed` (optional): Random seed for reproducibility (max 2147483647)

### Genfeed Mapping

```typescript
// Implementation in replicate-prompt.builder.ts:355-406
{
  prompt: promptText,
  aspect_ratio: calculateAspectRatio(params.width, params.height) || '1:1',
  magic_prompt_option: params.magicPromptOption ?? 'Auto',

  // Optional parameters
  seed: params.seed,
  resolution: params.resolution,
  style_type: params.styleType,
  style_preset: params.stylePreset,
  style_reference_images: params.styleReferenceImages,

  // Inpainting support
  image: params.references?.[0],
  mask: params.mask
}
```

**Key Features:**

- Extensive style presets (80+ artistic styles)
- Style types: Auto, General, Realistic, Design
- Magic Prompt for automatic prompt enhancement
- Multiple style reference images support
- Inpainting with mask support
- Flexible aspect ratios (12 options)
- 100+ resolution presets
