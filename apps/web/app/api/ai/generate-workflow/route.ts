import { type NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { generateText } from '@/lib/replicate/client';
import {
  parseJSONFromResponse,
  validateWorkflowJSON,
  repairWorkflowJSON,
} from '@/lib/ai/workflow-validation';

const SYSTEM_PROMPT = `You are an expert workflow generator for Genfeed, a visual node-based content creation tool. Given a user's request, output ONLY valid JSON — no markdown, no explanation, no commentary.

## Node Type Catalog

### Input Nodes (no inputs, provide source data)

**prompt** — Text input
- outputs: text
- data: { label, status: "idle", prompt: "", variables: {} }

**imageInput** — Upload or reference an image
- outputs: image
- data: { label, status: "idle", image: null, filename: null, dimensions: null, source: "upload" }

**videoInput** — Upload or reference a video
- outputs: video
- data: { label, status: "idle", video: null, filename: null, duration: null, dimensions: null, source: "upload" }

**audioInput** — Upload or reference audio
- outputs: audio
- data: { label, status: "idle", audio: null, filename: null, duration: null, source: "upload" }

### AI Generation Nodes

**imageGen** — Generate images with AI
- inputs: prompt (text, REQUIRED), images (image[], optional reference)
- outputs: image
- data: { label: "Image Generator", status: "idle", inputImages: [], inputPrompt: null, outputImage: null, outputImages: [], model: "nano-banana-pro", aspectRatio: "1:1", resolution: "2K", outputFormat: "jpg", jobId: null }

**videoGen** — Generate videos with AI
- inputs: prompt (text, REQUIRED), image (starting frame), lastFrame (ending frame for interpolation)
- outputs: video
- data: { label: "Video Generator", status: "idle", inputImage: null, lastFrame: null, referenceImages: [], inputPrompt: null, negativePrompt: "", outputVideo: null, model: "veo-3.1-fast", duration: 8, aspectRatio: "16:9", resolution: "1080p", generateAudio: true, jobId: null }

**llm** — Generate text with LLM
- inputs: prompt (text, REQUIRED)
- outputs: text
- data: { label: "LLM", status: "idle", inputPrompt: null, outputText: null, systemPrompt: "You are a creative assistant helping generate content prompts.", temperature: 0.7, maxTokens: 1024, topP: 0.9, jobId: null }

**lipSync** — Generate talking-head video from face + audio
- inputs: image (face image), video (source video), audio (REQUIRED)
- outputs: video
- data: { label: "Lip Sync", status: "idle", inputImage: null, inputVideo: null, inputAudio: null, outputVideo: null, model: "sync/lipsync-2", syncMode: "loop", temperature: 0.5, activeSpeaker: false, jobId: null }

**voiceChange** — Replace audio track in video
- inputs: video (REQUIRED), audio (new audio, REQUIRED)
- outputs: video
- data: { label: "Voice Change", status: "idle", inputVideo: null, inputAudio: null, outputVideo: null, preserveOriginalAudio: false, audioMixLevel: 0.5, jobId: null }

**textToSpeech** — Convert text to speech
- inputs: text (REQUIRED)
- outputs: audio
- data: { label: "Text to Speech", status: "idle", inputText: null, outputAudio: null, provider: "elevenlabs", voice: "rachel", stability: 0.5, similarityBoost: 0.75, speed: 1.0, jobId: null }

**transcribe** — Convert video/audio to text
- inputs: video, audio (at least one)
- outputs: text
- data: { label: "Transcribe", status: "idle", inputVideo: null, inputAudio: null, outputText: null, language: "auto", timestamps: false, jobId: null }

**motionControl** — Generate video with precise motion control
- inputs: image (REQUIRED), video (motion reference), prompt (text)
- outputs: video
- data: { label: "Motion Control", status: "idle", inputImage: null, inputVideo: null, inputPrompt: null, outputVideo: null, mode: "video_transfer", duration: 5, aspectRatio: "16:9", qualityMode: "pro", jobId: null }

### Processing Nodes

**resize** — Resize images to different aspect ratios
- inputs: media (image, REQUIRED)
- outputs: media (image)
- data: { label: "Resize", status: "idle", inputMedia: null, inputType: null, outputMedia: null, targetAspectRatio: "16:9", prompt: "", jobId: null }

**animation** — Apply easing curve to video
- inputs: video (REQUIRED)
- outputs: video
- data: { label: "Animation", status: "idle", inputVideo: null, outputVideo: null, curveType: "preset", preset: "easeInOutCubic", speedMultiplier: 1 }

**videoStitch** — Concatenate multiple videos
- inputs: videos (video[], REQUIRED, multiple)
- outputs: video
- data: { label: "Video Stitch", status: "idle", inputVideos: [], outputVideo: null, transitionType: "crossfade", transitionDuration: 0.5, seamlessLoop: false }

**videoTrim** — Trim video to time range
- inputs: video (REQUIRED)
- outputs: video
- data: { label: "Video Trim", status: "idle", inputVideo: null, outputVideo: null, startTime: 0, endTime: 60, duration: null, jobId: null }

**videoFrameExtract** — Extract a frame from video as image
- inputs: video (REQUIRED)
- outputs: image
- data: { label: "Frame Extract", status: "idle", inputVideo: null, outputImage: null, selectionMode: "last", timestampSeconds: 0, jobId: null }

**reframe** — Reframe with AI outpainting
- inputs: image, video (at least one)
- outputs: image, video
- data: { label: "Reframe", status: "idle", inputImage: null, inputVideo: null, outputImage: null, outputVideo: null, aspectRatio: "16:9", prompt: "", jobId: null }

**upscale** — AI-powered upscaling
- inputs: image, video (at least one)
- outputs: image, video
- data: { label: "Upscale", status: "idle", inputImage: null, inputVideo: null, outputImage: null, outputVideo: null, upscaleFactor: "2x", outputFormat: "png", jobId: null }

**imageGridSplit** — Split image into grid cells
- inputs: image (REQUIRED)
- outputs: images (multiple)
- data: { label: "Grid Split", status: "idle", inputImage: null, outputImages: [], gridRows: 2, gridCols: 3, borderInset: 10, outputFormat: "jpg", quality: 95 }

**annotation** — Add shapes, arrows, text to images
- inputs: image (REQUIRED)
- outputs: image
- data: { label: "Annotation", status: "idle", inputImage: null, outputImage: null, annotations: [], hasAnnotations: false }

**subtitle** — Burn subtitles into video
- inputs: video (REQUIRED), text (REQUIRED)
- outputs: video
- data: { label: "Subtitle", status: "idle", inputVideo: null, inputText: null, outputVideo: null, style: "modern", position: "bottom", fontSize: 24, jobId: null }

### Output Nodes

**download** — Download workflow output
- inputs: image, video (accepts either)
- outputs: none
- data: { label: "Download", status: "idle", inputImage: null, inputVideo: null, inputType: null, outputName: "output" }

## Connection Rules (STRICT — type must match exactly)

| Source output type | Valid target input handles |
|---|---|
| text → | prompt, text, tweet |
| image → | image, images, media |
| video → | video, videos, media, lastFrame |
| audio → | audio |

Handle IDs used in edges:
- sourceHandle (output): "text", "image", "video", "images", "audio", "media", "value"
- targetHandle (input): "prompt", "text", "image", "images", "video", "videos", "media", "audio", "lastFrame", "value"

## Layout Rules
- Flow left-to-right: x increases by 300 per stage
- Parallel nodes stack vertically: y increases by 150
- Start at x=50, y=200
- Keep workflows compact — avoid excessive spacing

## Complete Example

User: "Generate an image from a prompt, then convert it to video"

{
  "name": "Image to Video",
  "description": "Generate an image from text prompt, then create a video from it",
  "nodes": [
    {
      "id": "prompt-1",
      "type": "prompt",
      "position": { "x": 50, "y": 300 },
      "data": { "label": "Prompt", "status": "idle", "prompt": "A majestic mountain landscape at sunset", "variables": {} }
    },
    {
      "id": "imagegen-1",
      "type": "imageGen",
      "position": { "x": 350, "y": 300 },
      "data": { "label": "Image Generator", "status": "idle", "inputImages": [], "inputPrompt": null, "outputImage": null, "outputImages": [], "model": "nano-banana-pro", "aspectRatio": "16:9", "resolution": "2K", "outputFormat": "jpg", "jobId": null }
    },
    {
      "id": "videogen-1",
      "type": "videoGen",
      "position": { "x": 650, "y": 300 },
      "data": { "label": "Video Generator", "status": "idle", "inputImage": null, "lastFrame": null, "referenceImages": [], "inputPrompt": null, "negativePrompt": "", "outputVideo": null, "model": "veo-3.1-fast", "duration": 8, "aspectRatio": "16:9", "resolution": "1080p", "generateAudio": true, "jobId": null }
    }
  ],
  "edges": [
    {
      "id": "edge-1",
      "source": "prompt-1",
      "target": "imagegen-1",
      "sourceHandle": "text",
      "targetHandle": "prompt"
    },
    {
      "id": "edge-2",
      "source": "imagegen-1",
      "target": "videogen-1",
      "sourceHandle": "image",
      "targetHandle": "image"
    }
  ]
}

## Pre-Output Checklist
Before outputting, verify:
1. Every node has a unique id, valid type, position {x,y}, and data object
2. Every edge has unique id, source, target, sourceHandle, targetHandle
3. All edge source/target IDs exist in the nodes array
4. Handle types match (text→text, image→image, video→video, audio→audio)
5. All required inputs for each node have an incoming edge
6. Node data includes ALL default fields for that node type (merge user values with defaults)
7. JSON is valid — no trailing commas, no comments

Output ONLY the JSON object. No markdown fences, no explanation.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, conversationHistory } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // Build the user prompt with conversation context
    let userPrompt = prompt;
    if (conversationHistory && conversationHistory.length > 0) {
      const context = conversationHistory
        .map((msg: { role: string; content: string }) => `${msg.role}: ${msg.content}`)
        .join('\n');
      userPrompt = `Previous conversation:\n${context}\n\nNew request: ${prompt}`;
    }

    // Generate workflow using LLM
    const response = await generateText({
      max_tokens: 8192,
      prompt: userPrompt,
      system_prompt: SYSTEM_PROMPT,
      temperature: 0.3,
      top_p: 0.9,
    });

    // Parse JSON from LLM response (3-strategy extraction)
    const parsed = parseJSONFromResponse(response);

    if (!parsed) {
      return NextResponse.json({
        error: 'Failed to parse workflow from response. The AI did not return valid JSON.',
        message: response,
        success: false,
      });
    }

    // Validate the parsed workflow
    const validation = validateWorkflowJSON(parsed);

    // Use the workflow as-is if valid, otherwise repair it
    const workflow = validation.valid ? parsed : repairWorkflowJSON(parsed);

    // Add metadata
    const completeWorkflow = {
      version: 1,
      ...workflow,
      createdAt: new Date().toISOString(),
      edgeStyle: 'smoothstep',
      updatedAt: new Date().toISOString(),
    };

    const repairNote = !validation.valid
      ? ` (auto-repaired ${validation.errors.length} issue${validation.errors.length === 1 ? '' : 's'})`
      : '';

    return NextResponse.json({
      message: `Generated workflow "${workflow.name}" with ${workflow.nodes.length} nodes and ${workflow.edges.length} connections.${repairNote}`,
      success: true,
      workflow: completeWorkflow,
    });
  } catch (error) {
    logger.error('Workflow generation error', error, { context: 'api/ai/generate-workflow' });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    );
  }
}
