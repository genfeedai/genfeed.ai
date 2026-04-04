# Extension Service Refactor

## Overview

The Chrome extension services have been refactored to follow the same pattern as the frontend services, with environment-based configuration and a clean service architecture.

## Changes Made

### 1. Environment Service (`src/services/environment.service.ts`)

- **New file**: Centralized configuration for API endpoints and environment settings
- **Features**:
  - API endpoint configuration via `PLASMO_PUBLIC_API_ENDPOINT`
  - Environment detection (development/production/test)
  - Website domain configuration for cookie access
  - Fallback to production URLs when environment variables are not set

### 2. Base Service (`src/services/base.service.ts`)

- **New file**: Abstract base class for all API services
- **Features**:
  - Common HTTP methods (GET, POST, PUT, PATCH, DELETE)
  - Automatic authentication via `authService`
  - Error handling and response parsing
  - Consistent API interface across all services

### 3. Refactored Services

#### Auth Service (`src/services/auth.service.ts`)

- **Updated**: Now uses `EnvironmentService` for API endpoints and domain configuration
- **Features**:
  - Environment-aware domain detection
  - Centralized API endpoint configuration
  - Maintains all existing functionality

#### Prompts Service (`src/services/prompts.service.ts`)

- **Refactored**: Now extends `BaseService`
- **Features**:
  - `generateTweetReply()` method for Twitter/X integration
  - `getLatest()` method for fetching recent prompts
  - Backward compatibility with existing `generateTweetReply()` function

#### New Services

##### Videos Service (`src/services/videos.service.ts`)

- **New file**: Service for video-related API calls
- **Features**:
  - `getLatest()` - Get latest videos (used by extension)
  - `getById()` - Get specific video by ID
  - `getAll()` - Get videos with pagination and filtering

##### Images Service (`src/services/images.service.ts`)

- **New file**: Service for image-related API calls
- **Features**:
  - `getLatest()` - Get latest images (used by extension)
  - `getById()` - Get specific image by ID
  - `getAll()` - Get images with pagination and filtering

##### Musics Service (`src/services/musics.service.ts`)

- **New file**: Service for music-related API calls
- **Features**:
  - `getLatest()` - Get latest musics (used by extension)
  - `getById()` - Get specific music by ID
  - `getAll()` - Get musics with pagination and filtering

### 4. Service Index (`src/services/index.ts`)

- **New file**: Centralized exports for all services
- **Features**:
  - Clean imports from a single location
  - Backward compatibility exports
  - Organized service exports

### 5. API Endpoints

#### New `/latest` Endpoints

Added to all content controllers with comments indicating they're used by the extension:

- `GET /videos/latest?limit=10` - Get latest videos
- `GET /images/latest?limit=10` - Get latest images
- `GET /musics/latest?limit=10` - Get latest musics

**Features**:

- Cached responses (5 minutes TTL)
- User-specific content filtering
- Pagination support (limit capped at 50 for performance)
- Excludes training source content by default

### 6. CORS Configuration

Updated API CORS configuration to allow Chrome extensions:

```typescript
// Added to both development and production origins
/^chrome-extension:\/\/.*$/;
```

## Usage Examples

### Basic Service Usage

```typescript
import { videosService, imagesService, musicsService } from '../services';

// Get latest content
const latestVideos = await videosService.getLatest(10);
const latestImages = await imagesService.getLatest(10);
const latestMusics = await musicsService.getLatest(10);

// Get specific content
const video = await videosService.getById('video_id');
const image = await imagesService.getById('image_id');
const music = await musicsService.getById('music_id');
```

### Environment Configuration

```typescript
import { EnvironmentService } from '../services';

console.log('API Endpoint:', EnvironmentService.apiEndpoint);
console.log('Is Development:', EnvironmentService.isDevelopment);
console.log('Website Domain:', EnvironmentService.websiteDomain);
```

### Authentication

```typescript
import { authService } from '../services';

// Check auth status
const authState = await authService.isAuthenticated();

// Validate token
const isValid = await authService.validateToken();
```

## Environment Variables

The extension now supports the following environment variables:

- `PLASMO_PUBLIC_API_ENDPOINT` - API endpoint URL
- `PLASMO_PUBLIC_ASSETS_ENDPOINT` - Assets endpoint URL
- `PLASMO_PUBLIC_INGREDIENTS_ENDPOINT` - Ingredients endpoint URL
- `PLASMO_PUBLIC_WS_ENDPOINT` - WebSocket endpoint URL
- `PLASMO_PUBLIC_ENV` - Environment setting (development/production)

## Backward Compatibility

All existing functionality is preserved:

- `generateTweetReply()` function still works as before
- Auth service maintains all existing methods
- No breaking changes to existing code

## Benefits

1. **Consistency**: Same service pattern as frontend
2. **Environment-aware**: Easy configuration for different environments
3. **Maintainable**: Clean separation of concerns
4. **Extensible**: Easy to add new services
5. **Type-safe**: Full TypeScript support
6. **Cached**: API responses are cached for performance
7. **Secure**: Chrome extension CORS support added

## Migration Guide

### For Existing Code

No changes required! All existing imports and function calls continue to work.

### For New Code

Use the new service architecture:

```typescript
// Old way (still works)
import { generateTweetReply } from '../services';

// New way (recommended)
import { promptsService } from '../services';
const result = await promptsService.generateTweetReply(tweetId, url);
```

## Testing

The refactored services can be tested using the example file:

```typescript
import { completeWorkflowExample } from './examples/service-usage';

// Test the complete workflow
const result = await completeWorkflowExample();
console.log('Workflow result:', result);
```
