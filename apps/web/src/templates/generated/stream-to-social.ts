import type { WorkflowTemplate } from '@genfeedai/types';

export const STREAM_TO_SOCIAL_TEMPLATE: WorkflowTemplate = {
  createdAt: new Date().toISOString(),
  description:
    'Transform a 1-hour stream into engaging short-form content: transcribe → extract hot takes → generate intro + trim highlights → stitch → export',
  edgeStyle: 'smoothstep',
  edges: [
    // Video Input → Transcribe
    {
      id: 'e-input-transcribe',
      source: 'video-input',
      sourceHandle: 'video',
      target: 'transcribe',
      targetHandle: 'video',
    },

    // Transcribe → LLM Analysis
    {
      id: 'e-transcribe-llm',
      source: 'transcribe',
      sourceHandle: 'text',
      target: 'llm-analysis',
      targetHandle: 'prompt',
    },

    // LLM → Video Gen (for intro prompt)
    {
      id: 'e-llm-videogen',
      source: 'llm-analysis',
      sourceHandle: 'text',
      target: 'video-gen-intro',
      targetHandle: 'prompt',
    },

    // Video Input → Trim Segment 1
    {
      id: 'e-input-trim1',
      source: 'video-input',
      sourceHandle: 'video',
      target: 'trim-segment-1',
      targetHandle: 'video',
    },

    // Video Input → Trim Segment 2
    {
      id: 'e-input-trim2',
      source: 'video-input',
      sourceHandle: 'video',
      target: 'trim-segment-2',
      targetHandle: 'video',
    },

    // Video Gen Intro → Stitch
    {
      id: 'e-intro-stitch',
      source: 'video-gen-intro',
      sourceHandle: 'video',
      target: 'stitch',
      targetHandle: 'videos',
    },

    // Trim Segment 1 → Stitch
    {
      id: 'e-trim1-stitch',
      source: 'trim-segment-1',
      sourceHandle: 'video',
      target: 'stitch',
      targetHandle: 'videos',
    },

    // Trim Segment 2 → Stitch
    {
      id: 'e-trim2-stitch',
      source: 'trim-segment-2',
      sourceHandle: 'video',
      target: 'stitch',
      targetHandle: 'videos',
    },

    // Stitch → Output
    {
      id: 'e-stitch-output',
      source: 'stitch',
      sourceHandle: 'video',
      target: 'output',
      targetHandle: 'video',
    },
  ],
  name: 'Stream to Short-Form Content',
  nodes: [
    // Stage 1: Video Input
    {
      data: {
        dimensions: null,
        duration: null,
        filename: null,
        label: '1h Stream',
        source: 'upload',
        status: 'idle',
        video: null,
      },
      id: 'video-input',
      position: { x: 50, y: 400 },
      type: 'videoInput',
    },

    // Stage 2: Transcribe
    {
      data: {
        inputAudio: null,
        inputVideo: null,
        jobId: null,
        label: 'Transcribe Stream',
        language: 'auto',
        outputText: null,
        status: 'idle',
        timestamps: true,
      },
      id: 'transcribe',
      position: { x: 350, y: 400 },
      type: 'transcribe',
    },

    // Stage 3: LLM - Extract Hot Takes & Segment Ideas
    {
      data: {
        inputPrompt: null,
        jobId: null,
        label: 'Hot Takes Extractor',
        maxTokens: 2048,
        outputText: null,
        status: 'idle',
        systemPrompt: `You are a content strategist for viral social media. Analyze this stream transcript and extract:

1. **HOOK (for intro video):** A compelling 30-second hook that captures the stream's best moment
   - Format: [HOOK] ... [/HOOK]

2. **HOT TAKES (3-5):** The most engaging, quotable, or controversial statements
   - Format: [TAKE] timestamp | quote | context [/TAKE]

3. **HIGHLIGHT SEGMENTS (2):** The best continuous segments for clips
   - Format: [SEGMENT] start_time | end_time | reason [/SEGMENT]
   - Segment 1 should be 3-4 minutes
   - Segment 2 should be 4-5 minutes

4. **INTRO PROMPT:** A video generation prompt for a 1-minute AI intro
   - Format: [INTRO_PROMPT] ... [/INTRO_PROMPT]

Focus on content that will hook viewers in the first 3 seconds.`,
        temperature: 0.7,
        topP: 0.9,
      },
      id: 'llm-analysis',
      position: { x: 650, y: 400 },
      type: 'llm',
    },

    // Stage 4a: Video Gen - AI Intro (1 min)
    {
      data: {
        aspectRatio: '16:9',
        duration: 8,
        generateAudio: true,
        inputImage: null,
        inputPrompt: null,
        jobId: null,
        label: 'AI Intro (1 min)',
        lastFrame: null,
        model: 'veo-3.1-fast',
        negativePrompt: 'blurry, distorted, low quality, watermark',
        outputVideo: null,
        referenceImages: [],
        resolution: '1080p',
        status: 'idle',
      },
      id: 'video-gen-intro',
      position: { x: 1000, y: 200 },
      type: 'videoGen',
    },

    // Stage 4b: Video Trim - Segment 1 (3-4 min)
    {
      data: {
        duration: null,
        endTime: 540,
        inputVideo: null,
        jobId: null,
        label: 'Highlight 1 (3-4 min)',
        outputVideo: null,
        startTime: 300,
        status: 'idle',
      },
      id: 'trim-segment-1',
      position: { x: 1000, y: 400 },
      type: 'videoTrim',
    },

    // Stage 4c: Video Trim - Segment 2 (4-5 min)
    {
      data: {
        duration: null,
        endTime: 2100,
        inputVideo: null,
        jobId: null,
        label: 'Highlight 2 (4-5 min)',
        outputVideo: null,
        startTime: 1800,
        status: 'idle',
      },
      id: 'trim-segment-2',
      position: { x: 1000, y: 600 },
      type: 'videoTrim',
    },

    // Stage 5: Video Stitch
    {
      data: {
        audioCodec: 'aac',
        inputVideos: [],
        label: 'Combine All',
        outputQuality: 'full',
        outputVideo: null,
        seamlessLoop: false,
        status: 'idle',
        transitionDuration: 0.5,
        transitionType: 'crossfade',
      },
      id: 'stitch',
      position: { x: 1350, y: 400 },
      type: 'videoStitch',
    },

    // Stage 6: Final Output
    {
      data: {
        inputMedia: null,
        inputType: 'video',
        label: 'Final Output',
        outputName: 'stream-highlights',
        status: 'idle',
      },
      id: 'output',
      position: { x: 1700, y: 400 },
      type: 'download',
    },
  ],
  updatedAt: new Date().toISOString(),
  version: 1,
};
