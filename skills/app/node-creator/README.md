# Node Creator

Create custom nodes for Genfeed using the SDK's fluent builder API.

## Installation

```bash
npx skills add genfeedai/skills/node-creator
```

## Usage

Describe the custom node you want to create:

```
Create a node that applies color filters to images
```

```
Build a node for extracting text from images using OCR
```

```
Make a node that combines audio tracks with crossfade transitions
```

## What It Does

This skill generates complete TypeScript code for custom Genfeed nodes, including:

- **Type-safe data interfaces**: Strongly typed node data
- **Handle definitions**: Properly configured inputs and outputs
- **Configuration fields**: UI controls for user settings
- **Processing logic**: Async processor with progress updates
- **Validation**: Input validation patterns
- **Cost estimation**: For paid API integrations

## SDK Overview

```typescript
import { createNode, registerNode } from '@genfeedai/sdk';

const myNode = createNode('myOrg/customNode')
  .name('My Custom Node')
  .description('Does something useful')
  .category('processing')
  .input('image', 'image', 'Input Image', { required: true })
  .output('image', 'image', 'Processed Image')
  .config({ key: 'intensity', type: 'slider', label: 'Intensity', min: 0, max: 100 })
  .process(async (data, ctx) => {
    await ctx.updateProgress(50, 'Processing...');
    return { outputs: { image: processedUrl } };
  })
  .build();

registerNode(myNode);
```

## Handle Types

| Type | Description |
|------|-------------|
| `image` | Image URL (string) |
| `video` | Video URL (string) |
| `audio` | Audio URL (string) |
| `text` | Text string |
| `number` | Numeric value |

## Config Field Types

| Type | Description | Options |
|------|-------------|---------|
| `text` | Text input | placeholder |
| `number` | Number input | min, max, step |
| `select` | Dropdown | options[] |
| `checkbox` | Toggle | - |
| `slider` | Range slider | min, max, step |
| `textarea` | Multi-line text | placeholder |
| `color` | Color picker | - |

## Node Categories

| Category | Use For |
|----------|---------|
| `input` | Data source nodes |
| `ai` | AI generation/processing |
| `processing` | Transform/modify media |
| `output` | Final output collectors |
| `custom` | User-defined nodes |

## Example Output

```typescript
import { createNode, registerNode } from '@genfeedai/sdk';

interface ImageFilterData {
  label: string;
  status: 'idle' | 'pending' | 'processing' | 'complete' | 'error';
  inputImage: string | null;
  outputImage: string | null;
  filterType: 'blur' | 'sharpen' | 'grayscale';
  intensity: number;
}

const imageFilterNode = createNode<ImageFilterData>('custom/imageFilter')
  .name('Image Filter')
  .description('Apply visual filters to images')
  .category('processing')
  .icon('Wand2')
  .input('image', 'image', 'Input Image', { required: true })
  .output('image', 'image', 'Filtered Image')
  .config({
    key: 'filterType',
    type: 'select',
    label: 'Filter Type',
    options: [
      { value: 'blur', label: 'Blur' },
      { value: 'sharpen', label: 'Sharpen' },
      { value: 'grayscale', label: 'Grayscale' },
    ],
  })
  .config({
    key: 'intensity',
    type: 'slider',
    label: 'Intensity',
    min: 0,
    max: 100,
  })
  .defaults({
    label: 'Image Filter',
    status: 'idle',
    inputImage: null,
    outputImage: null,
    filterType: 'blur',
    intensity: 50,
  })
  .process(async (data, ctx) => {
    const imageUrl = ctx.inputs.image as string;
    await ctx.updateProgress(50, 'Applying filter...');

    const result = await applyFilter(imageUrl, data.filterType, data.intensity);

    return { outputs: { image: result.url } };
  })
  .build();

registerNode(imageFilterNode);
```

## License

MIT
