# FAL.AI Integration for GenFeed.AI

This integration adds **600+ fal.ai models** to GenFeed.AI with dynamic discovery, real-time pricing, and cloud revenue generation.

## 🚀 Features

- **Dynamic Model Discovery**: Auto-discover all fal.ai models without manual configuration
- **Real-time Pricing**: 70% margin on fal.ai costs for cloud users
- **Zero Disruption**: Preserves existing Replicate models and pricing
- **Cloud + Core Support**: Revenue model for cloud, direct costs for core users
- **Smart Categorization**: Automatic model categorization (Image, Video, Audio, Text)
- **Batch Management**: CLI tools for discovery, syncing, and management

## 🛠️ Setup

### 1. Environment Variables

```bash
# Required for dynamic discovery
FAL_API_KEY=your-fal-api-key-here

# Optional: GenFeed API token
GENFEED_API_TOKEN=your-api-token
```

### 2. Test Connection

```bash
bun run fal:test
```

### 3. Discover Models

```bash
# Preview available models
bun run fal:discover --limit 10

# See all available models  
bun run fal:discover
```

## 📊 Management Commands

### Basic Commands

```bash
# Test fal.ai API connection
bun run fal:test

# Discover available models
bun run fal:discover

# Sync pricing for existing fal.ai models
bun run fal:sync

# Add new discovered models to database
bun run fal:add

# Show model statistics
bun run fal:stats
```

### Advanced Usage

```bash
# Preview sync without changes
bun run fal:sync --dry-run

# Discover limited results
bun run fal:discover --limit 5

# Manual command with options
bun run fal:manage discover --limit 20 --dry-run
```

## 🏗️ Architecture

### Enhanced Models Service

The integration extends the existing `ModelsService` with dynamic capabilities:

```typescript
import { EnhancedModelsService } from '@services/ai/enhanced-models.service';

const service = new EnhancedModelsService(token);
await service.initialize({ falApiKey: 'your-key' });

// Get all models (existing + fal.ai)
const allModels = await service.getAllModels();

// Get only fal.ai models
const falModels = await service.getFalModels();

// Sync pricing
await service.syncFalPricing();
```

### FAL Provider Service

Handles dynamic discovery and pricing:

```typescript
import { FalProviderService } from '@services/ai/providers/fal/fal-provider.service';

const provider = new FalProviderService();
provider.setApiKey('your-key');

// Discover models
const models = await provider.discoverModels();

// Get pricing
const cost = await provider.getModelPricing('fal-ai/flux-dev');
```

## 💰 Business Model

### Cloud Deployment (Revenue Generation)
- **70% margin** on fal.ai costs
- **Minimum $0.001** charge floor
- **Admin controls** for enabling/disabling models
- **Real-time pricing updates**

### Core Deployment (User API Keys)
- **Users provide own FAL_API_KEY**
- **Direct fal.ai costs** (no markup)
- **Same features** as cloud deployment

## 📈 Model Categories

The integration automatically categorizes models:

- **Image Generation**: `fal-ai/flux-dev`, `fal-ai/flux-pro`
- **Video Generation**: `fal-ai/kling-video`, `fal-ai/luma-dream-machine`
- **Voice/Audio**: `fal-ai/whisper`, `fal-ai/eleven-labs-tts`
- **Image Editing**: `fal-ai/face-swap`, `fal-ai/upscaler`

## 🔍 Model Discovery

Models are discovered from multiple sources:

1. **Predefined Models**: Curated list with verified pricing
2. **Dynamic Discovery**: Real-time discovery from fal.ai API
3. **Smart Mapping**: Automatic category and capability detection

## ⚡ Quick Start Example

```bash
# 1. Set your API key
export FAL_API_KEY="your-fal-api-key"

# 2. Test connection
bun run fal:test

# 3. Discover available models
bun run fal:discover --limit 10

# 4. Add models to your database
bun run fal:add

# 5. Check statistics
bun run fal:stats
```

## 🚨 Important Notes

### Cloud vs Core Considerations

- **Cloud**: Models generate 70% margin revenue
- **Core**: Users need their own FAL_API_KEY
- **Existing Models**: Replicate models are preserved unchanged

### API Rate Limits

- fal.ai has rate limits for model discovery
- The integration respects these limits and handles errors gracefully
- For high-volume usage, consider caching discovered models

### Model Validation

- Models are validated before adding to database
- Invalid or deprecated models are filtered out
- Pricing is validated and has minimum thresholds

## 🔧 Troubleshooting

### Connection Issues

```bash
# Test API key
bun run fal:test

# Check configuration
echo $FAL_API_KEY
```

### Model Discovery Problems

```bash
# Check for API errors in logs
bun run fal:discover

# Try with limited results
bun run fal:discover --limit 1
```

### Pricing Sync Issues

```bash
# Dry run to preview changes
bun run fal:sync --dry-run

# Check individual model pricing
bun run fal:manage test
```

## 📝 Next Steps

1. **Configure your FAL_API_KEY**
2. **Run model discovery**
3. **Add profitable models**
4. **Set up automated pricing sync**
5. **Monitor usage and revenue**

For questions or issues, check the GenFeed.AI documentation or contact support.