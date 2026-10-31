# Workflow Creator

Create AI content workflows from natural language descriptions.

## Installation

```bash
npx skills add genfeedai/skills/workflow-creator
```

## Usage

Describe the content pipeline you want to create:

```
Create a workflow that takes an image and generates a video with motion
```

```
Build a pipeline for creating talking head videos from text and a portrait image
```

```
Make a workflow that generates multiple images from prompts and stitches them into a video
```

## What It Does

This skill generates complete Genfeed workflow JSON that you can import directly into Genfeed Studio. It understands:

- **24+ node types**: Image generation, video generation, LLM, lip sync, text-to-speech, upscaling, and more
- **Connection rules**: Ensures type-safe connections between nodes
- **Layout best practices**: Arranges nodes in a clean left-to-right flow
- **Default configurations**: Sets sensible defaults for each node type

## Example Output

```json
{
  "name": "Image to Video Pipeline",
  "description": "Generate a video from an image and prompt",
  "edgeStyle": "bezier",
  "nodes": [
    { "id": "node_1", "type": "imageInput", "position": { "x": 0, "y": 0 }, "data": {...} },
    { "id": "node_2", "type": "prompt", "position": { "x": 0, "y": 150 }, "data": {...} },
    { "id": "node_3", "type": "videoGen", "position": { "x": 300, "y": 75 }, "data": {...} },
    { "id": "node_4", "type": "output", "position": { "x": 600, "y": 75 }, "data": {...} }
  ],
  "edges": [
    { "id": "edge_node_1_node_3", "source": "node_1", "target": "node_3", "sourceHandle": "image", "targetHandle": "image" },
    { "id": "edge_node_2_node_3", "source": "node_2", "target": "node_3", "sourceHandle": "text", "targetHandle": "prompt" },
    { "id": "edge_node_3_node_4", "source": "node_3", "target": "node_4", "sourceHandle": "video", "targetHandle": "media" }
  ]
}
```

## Supported Node Types

### Input Nodes

- `imageInput` - Upload images
- `videoInput` - Upload videos
- `audioInput` - Upload audio files
- `prompt` - Text prompts
- `template` - Preset prompt templates

### AI Generation Nodes

- `imageGen` - Generate images (nano-banana models)
- `videoGen` - Generate videos (veo-3.1 models)
- `llm` - Text generation (meta-llama)
- `lipSync` - Talking head generation
- `textToSpeech` - Text to speech (ElevenLabs)
- `transcribe` - Speech to text
- `voiceChange` - Audio replacement
- `motionControl` - Motion control video (Kling AI)

### Processing Nodes

- `reframe` - Change aspect ratios with AI outpainting
- `upscale` - AI upscaling (Topaz)
- `resize` - Resize media (Luma AI)
- `videoStitch` - Concatenate videos
- `videoTrim` - Trim video clips
- `videoFrameExtract` - Extract frames
- `imageGridSplit` - Split into grid
- `annotation` - Add shapes/text
- `subtitle` - Burn subtitles
- `animation` - Apply easing curves

### Output Nodes

- `output` - Final workflow output

## License

MIT
