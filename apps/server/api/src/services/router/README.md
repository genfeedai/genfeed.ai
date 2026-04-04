# Model Router Service

Intelligent model selection service that automatically chooses the best AI model based on user prompts and requirements.

## Overview

The Router Service uses **rule-based routing** (no LLM calls) to analyze prompts and select optimal models for image, video, and article generation. It considers factors like prompt complexity, quality indicators, dimensions, duration, and user priorities (quality/speed/cost).

## Features

✅ **No External API Calls** - Fast, free routing using pattern matching
✅ **Multi-Category Support** - Images, Videos, Articles
✅ **Flexible Priorities** - Optimize for quality, speed, cost, or balanced
✅ **Transparent** - Provides reasoning and alternatives
✅ **Extensible** - Easy to add new models and rules

## Architecture

```
┌─────────────────────────────────────────────┐
│         RouterController                     │
│  POST /api/router/select-model               │
└──────────────────┬──────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────┐
│         RouterService                        │
│  • analyzePrompt()                           │
│  • selectImageModel()                        │
│  • selectVideoModel()                        │
│  • selectTextModel()                         │
└──────────────────┬──────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────┐
│         ModelsService                        │
│  • findOne() - Get model from database       │
└─────────────────────────────────────────────┘
```

## Files Structure

```
services/router/
├── README.md                        # This file
├── router.module.ts                 # NestJS module definition
├── router.service.ts                # Core routing logic
├── router.service.spec.ts           # Unit tests
├── router.controller.ts             # REST API endpoint
├── interfaces/
│   └── router.interfaces.ts         # TypeScript interfaces
└── dto/
    └── select-model.dto.ts          # Request/response DTOs
```

## API Endpoint

### POST `/api/router/select-model`

Selects the optimal model based on prompt analysis.

**Authentication:** Required (Clerk JWT)

**Request Body:**
```typescript
{
  prompt: string;              // User's content generation prompt
  category: ModelCategory;     // 'image' | 'video' | 'text'
  prioritize?: 'quality' | 'speed' | 'cost' | 'balanced';  // Default: 'balanced'
  dimensions?: {
    width?: number;
    height?: number;
  };
  duration?: number;           // For videos (4-60 seconds)
  speech?: string;             // For videos with narration
  outputs?: number;            // Number of outputs (1-4)
}
```

**Response:**
```typescript
{
  selectedModel: string;       // Model key (e.g., 'google/imagen-4')
  reason: string;              // Human-readable explanation
  modelDetails: {
    id: string;
    key: string;
    provider: string;
    category: string;
    cost: number;
  };
  alternatives: [              // Up to 2 alternative models
    {
      model: string;
      reason: string;
      score: number;
    }
  ];
  analysis: {
    complexity: 'simple' | 'medium' | 'complex';
    hasQualityIndicators: boolean;
    hasSpeedIndicators: boolean;
    hasSpecificStyle: boolean;
    detectedFeatures: string[];
    keywords: string[];
    estimatedLength: number;
  };
}
```

## Routing Logic

### Image Generation

```typescript
Priority: Speed
  → google/imagen-4-fast

Priority: Cost
  → gpt-image-1 (stylized/simple)
  → google/imagen-4-fast (realistic)

Priority: Quality
  → google/imagen-4-ultra (complex prompts)
  → google/imagen-4 (standard quality)

Balanced (default):
  • Stylized/artistic → gpt-image-1
  • Photorealistic → google/imagen-4
  • Large dimensions → google/imagen-4
  • Default → gpt-image-1
```

### Video Generation

```typescript
With Speech:
  → google/veo-3 (only model supporting speech)

Priority: Speed
  → google/veo-3-fast

Priority: Cost
  → google/veo-3-fast (<15s)
  → sora-2 (standard)

Priority: Quality
  → google/veo-3

Balanced (default):
  • Long duration (>30s) → google/veo-3
  • Cinematic keywords → google/veo-3
  • Short clips (<15s) → google/veo-3-fast
  • Default → sora-2
```

### Text/Article Generation

```typescript
Priority: Quality or Complex:
  → gpt-4

Priority: Speed or Simple:
  → gpt-3.5-turbo

Balanced:
  → gpt-4
```

## Prompt Analysis

The service analyzes prompts for:

**Quality Indicators:**
- Keywords: professional, high quality, detailed, intricate, complex, photorealistic, ultra, 4k, hd

**Speed Indicators:**
- Keywords: quick, fast, simple, draft, rapid, immediate

**Style Indicators:**
- Keywords: anime, cartoon, oil painting, watercolor, sketch, artistic, stylized, illustration

**Detected Features:**
- cinematic, photorealistic, landscape, portrait, artistic

**Complexity Assessment:**
- Simple: <50 chars, no quality indicators
- Complex: >200 chars OR quality indicators OR 3+ features
- Medium: Everything else

## Model Capabilities

Models are configured with metadata:

```typescript
interface ModelCapabilities {
  key: string;                          // Model identifier
  provider: string;                     // google, openai, etc.
  category: ModelCategory;              // image, video, text
  capabilities: string[];               // ['photorealistic', 'fast']
  costTier: 'low' | 'medium' | 'high';
  recommendedFor: string[];             // ['portrait', 'landscape']
  minDimensions?: { width, height };
  maxDimensions?: { width, height };
  supportsFeatures?: string[];          // ['speech', 'long-duration']
  speedTier: 'fast' | 'medium' | 'slow';
  qualityTier: 'basic' | 'standard' | 'high' | 'ultra';
}
```

## Database Schema Updates

Added fields to `models` collection:

```typescript
capabilities: string[];              // Default: []
costTier: 'low' | 'medium' | 'high'; // Default: 'medium'
recommendedFor: string[];            // Default: []
minDimensions: { width, height };    // Optional
maxDimensions: { width, height };    // Optional
supportsFeatures: string[];          // Default: []
speedTier: 'fast' | 'medium' | 'slow';          // Default: 'medium'
qualityTier: 'basic' | 'standard' | 'high' | 'ultra';  // Default: 'standard'
```

## DTO Updates

### CreateImageDto
Added field: `autoSelectModel?: boolean`

### CreateVideoDto
Added field: `autoSelectModel?: boolean`

When `autoSelectModel: true`, the generation endpoints should call the router service internally to select the model before processing.

## Usage Examples

### Example 1: Image Generation with Auto-Selection

```typescript
// Request to /api/router/select-model
{
  "prompt": "A professional high-quality portrait of a person in natural lighting",
  "category": "image",
  "prioritize": "quality",
  "dimensions": { "width": 1920, "height": 1080 }
}

// Response
{
  "selectedModel": "google/imagen-4",
  "reason": "Optimized for quality, high-quality prompt detected, supports photorealistic",
  "modelDetails": { ... },
  "alternatives": [
    {
      "model": "google/imagen-4-ultra",
      "reason": "Higher quality",
      "score": 95
    }
  ],
  "analysis": {
    "complexity": "complex",
    "hasQualityIndicators": true,
    "detectedFeatures": ["photorealistic", "portrait"]
  }
}
```

### Example 2: Video Generation with Speech

```typescript
// Request
{
  "prompt": "A video explaining quantum physics",
  "category": "video",
  "duration": 30,
  "speech": "Quantum physics is the study of..."
}

// Response
{
  "selectedModel": "google/veo-3",
  "reason": "Speech support required, supports speech",
  "modelDetails": { ... }
}
```

### Example 3: Cost-Optimized Image

```typescript
// Request
{
  "prompt": "A simple cartoon character",
  "category": "image",
  "prioritize": "cost"
}

// Response
{
  "selectedModel": "gpt-image-1",
  "reason": "Optimized for cost, fast generation",
  "modelDetails": { ... }
}
```

## Testing

Run tests:
```bash
npm test -- router.service.spec.ts
```

Test coverage includes:
- ✅ Speed/quality/cost priority selection
- ✅ Image routing for different prompt types
- ✅ Video routing with speech and duration
- ✅ Prompt analysis (quality, speed, style detection)
- ✅ Complexity categorization
- ✅ Error handling
- ✅ Alternative recommendations

## Frontend Integration

The frontend should use a proper service pattern (not direct fetch):

```typescript
// ❌ DON'T DO THIS
const result = await fetch('/api/router/select-model', { ... });

// ✅ DO THIS
import { RouterService } from '@services/router/router.service';

const routerService = RouterService.getInstance();
const recommendation = await routerService.selectModel({
  prompt: userPrompt,
  category: 'image',
  prioritize: 'balanced'
});
```

## Future Enhancements

### Phase 2 (Future)
- [ ] Machine learning-based routing
- [ ] User feedback loop to improve selections
- [ ] A/B testing different routing strategies
- [ ] Dynamic model performance tracking
- [ ] Per-user model preferences
- [ ] Semantic routing using embeddings

### Phase 3 (Future)
- [ ] Cost tracking and optimization
- [ ] Rate limit-aware routing
- [ ] Fallback strategies for model failures
- [ ] Multi-model generation with comparison

## Performance

- **Routing Time:** <10ms (no external API calls)
- **Accuracy:** Based on rule patterns (no probabilistic)
- **Scalability:** Stateless, horizontally scalable

## Monitoring

The service logs:
- Model selection decisions
- Prompt analysis results
- Model lookups
- Errors and warnings

Example logs:
```
[RouterService] selectModel started: category=image, promptLength=45
[RouterService] selectModel completed: selectedModel=gpt-image-1, category=image, complexity=simple
```

## Contributing

When adding new models:

1. Add model capabilities to `modelCapabilities` Map in `router.service.ts`
2. Update routing logic in appropriate method (`selectImageModel`, `selectVideoModel`, etc.)
3. Add model to database with routing metadata
4. Add test cases in `router.service.spec.ts`
5. Update this README

## Related Files

- [Models Schema](../../collections/models/schemas/model.schema.ts)
- [Models Service](../../collections/models/services/models.service.ts)
- [CreateImageDto](../../collections/images/dto/create-image.dto.ts)
- [CreateVideoDto](../../collections/videos/dto/create-video.dto.ts)

## Support

For questions or issues:
- Check test cases for examples
- Review routing logic in `router.service.ts`
- See Swagger docs at `/api/docs`
