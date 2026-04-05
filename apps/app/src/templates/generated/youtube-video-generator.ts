import type { WorkflowTemplate } from '@genfeedai/types';

export const YOUTUBE_VIDEO_GENERATOR_TEMPLATE: WorkflowTemplate = {
  createdAt: new Date().toISOString(),
  description:
    'Generate a complete 10-minute YouTube video: script → images → videos with camera movements → stitch → music → subtitles',
  edgeStyle: 'smoothstep',
  edges: [
    // Script flow
    {
      id: 'e-script-1',
      source: 'script-input',
      sourceHandle: 'text',
      target: 'llm-script',
      targetHandle: 'prompt',
    },
    {
      id: 'e-script-2',
      source: 'llm-script',
      sourceHandle: 'text',
      target: 'llm-scenes',
      targetHandle: 'prompt',
    },

    // LLM → Images (20 edges)
    ...Array.from({ length: 20 }, (_, i) => ({
      id: `e-img-prompt-${i + 1}`,
      source: 'llm-scenes',
      sourceHandle: 'text',
      target: `img-${i + 1}`,
      targetHandle: 'prompt',
    })),

    // Images → Videos (20 edges)
    ...Array.from({ length: 20 }, (_, i) => ({
      id: `e-img-vid-${i + 1}`,
      source: `img-${i + 1}`,
      sourceHandle: 'image',
      target: `vid-${i + 1}`,
      targetHandle: 'image',
    })),

    // LLM → Videos for camera prompts (20 edges)
    ...Array.from({ length: 20 }, (_, i) => ({
      id: `e-vid-prompt-${i + 1}`,
      source: 'llm-scenes',
      sourceHandle: 'text',
      target: `vid-${i + 1}`,
      targetHandle: 'prompt',
    })),

    // Videos → Stitch (20 edges)
    ...Array.from({ length: 20 }, (_, i) => ({
      id: `e-stitch-${i + 1}`,
      source: `vid-${i + 1}`,
      sourceHandle: 'video',
      target: 'stitch',
      targetHandle: 'videos',
    })),

    // Stitch → Voice Change (add music)
    {
      id: 'e-stitch-voice',
      source: 'stitch',
      sourceHandle: 'video',
      target: 'voice-change',
      targetHandle: 'video',
    },
    {
      id: 'e-audio-voice',
      source: 'audio-music',
      sourceHandle: 'audio',
      target: 'voice-change',
      targetHandle: 'audio',
    },

    // Script → Subtitle (for subtitle text)
    {
      id: 'e-script-subtitle',
      source: 'llm-script',
      sourceHandle: 'text',
      target: 'subtitle',
      targetHandle: 'text',
    },

    // Voice Change → Subtitle
    {
      id: 'e-voice-subtitle',
      source: 'voice-change',
      sourceHandle: 'video',
      target: 'subtitle',
      targetHandle: 'video',
    },

    // Subtitle → Output
    {
      id: 'e-subtitle-output',
      source: 'subtitle',
      sourceHandle: 'video',
      target: 'output',
      targetHandle: 'video',
    },
  ],
  name: 'YouTube 10-Min Video Generator',
  nodes: [
    // Stage 1: Script Input & Generation
    {
      data: {
        label: 'Script/Topic',
        prompt:
          'Create a 10-minute educational video about the history of artificial intelligence, from its origins in the 1950s to modern deep learning breakthroughs.',
        status: 'idle',
        variables: {},
      },
      id: 'script-input',
      position: { x: 50, y: 600 },
      type: 'prompt',
    },
    {
      data: {
        inputPrompt: null,
        jobId: null,
        label: 'Script Generator',
        maxTokens: 4096,
        outputText: null,
        status: 'idle',
        systemPrompt:
          'You are a professional YouTube scriptwriter. Generate a complete 10-minute video script with clear narration, engaging hooks, and natural transitions. Include timestamps and speaker directions. The script should be compelling and educational.',
        temperature: 0.8,
        topP: 0.9,
      },
      id: 'llm-script',
      position: { x: 350, y: 500 },
      type: 'llm',
    },
    {
      data: {
        inputPrompt: null,
        jobId: null,
        label: 'Scene Expander',
        maxTokens: 8192,
        outputText: null,
        status: 'idle',
        systemPrompt: `You are a video director. Break this script into exactly 20 scenes for video generation.

For each scene, provide:
1. SCENE NUMBER (1-20)
2. VISUAL DESCRIPTION: Detailed image prompt for the key frame
3. CAMERA MOVEMENT: One of: slow zoom in, slow zoom out, pan left, pan right, dolly forward, dolly back, static, subtle drift
4. DURATION: 30 seconds each
5. MOOD: The emotional tone

Format each scene as:
---SCENE [N]---
VISUAL: [detailed image description, style, lighting, composition]
CAMERA: [camera movement instruction]
MOOD: [emotional tone]
---END SCENE---

Ensure visual continuity between scenes. Total runtime: 10 minutes (20 × 30 seconds).`,
        temperature: 0.7,
        topP: 0.9,
      },
      id: 'llm-scenes',
      position: { x: 650, y: 500 },
      type: 'llm',
    },

    // Stage 2: Image Generation (20 scenes)
    ...Array.from({ length: 20 }, (_, i) => ({
      data: {
        aspectRatio: '16:9' as const,
        inputImages: [],
        inputPrompt: null,
        jobId: null,
        label: `Scene ${i + 1} Image`,
        model: 'nano-banana-pro' as const,
        outputFormat: 'jpg' as const,
        outputImage: null,
        resolution: '2K' as const,
        status: 'idle' as const,
      },
      id: `img-${i + 1}`,
      position: { x: 1000, y: 50 + i * 120 },
      type: 'imageGen' as const,
    })),

    // Stage 3: Video Generation (20 scenes with camera movements)
    ...Array.from({ length: 20 }, (_, i) => ({
      data: {
        aspectRatio: '16:9' as const,
        duration: 8 as const,
        generateAudio: false,
        inputImage: null,
        inputPrompt: null,
        jobId: null,
        label: `Scene ${i + 1} Video`,
        lastFrame: null,
        model: 'veo-3.1' as const,
        negativePrompt: 'blurry, distorted, low quality, watermark, text overlay',
        outputVideo: null,
        referenceImages: [],
        resolution: '1080p' as const,
        status: 'idle' as const,
      },
      id: `vid-${i + 1}`,
      position: { x: 1350, y: 50 + i * 120 },
      type: 'videoGen' as const,
    })),

    // Stage 4: Video Stitching
    {
      data: {
        audioCodec: 'aac',
        inputVideos: [],
        label: 'Video Stitcher',
        outputQuality: 'full',
        outputVideo: null,
        seamlessLoop: false,
        status: 'idle',
        transitionDuration: 0.5,
        transitionType: 'crossfade',
      },
      id: 'stitch',
      position: { x: 1700, y: 600 },
      type: 'videoStitch',
    },

    // Stage 5: Audio Input (Background Music)
    {
      data: {
        audio: null,
        duration: null,
        filename: null,
        label: 'Background Music',
        source: 'upload',
        status: 'idle',
      },
      id: 'audio-music',
      position: { x: 1700, y: 300 },
      type: 'audioInput',
    },

    // Stage 6: Voice Change (Audio Mixer)
    {
      data: {
        audioMixLevel: 0.3,
        inputAudio: null,
        inputVideo: null,
        jobId: null,
        label: 'Audio Mixer',
        outputVideo: null,
        preserveOriginalAudio: false,
        status: 'idle',
      },
      id: 'voice-change',
      position: { x: 2050, y: 500 },
      type: 'voiceChange',
    },

    // Stage 7: Subtitle
    {
      data: {
        backgroundColor: 'rgba(0,0,0,0.7)',
        fontColor: '#FFFFFF',
        fontFamily: 'Arial',
        fontSize: 24,
        inputText: null,
        inputVideo: null,
        jobId: null,
        label: 'Subtitles',
        outputVideo: null,
        position: 'bottom',
        status: 'idle',
        style: 'modern',
      },
      id: 'subtitle',
      position: { x: 2400, y: 500 },
      type: 'subtitle',
    },

    // Final Output
    {
      data: {
        inputMedia: null,
        inputType: 'video',
        label: 'Final Video',
        outputName: 'youtube-video-10min',
        status: 'idle',
      },
      id: 'output',
      position: { x: 2750, y: 500 },
      type: 'download',
    },
  ],
  updatedAt: new Date().toISOString(),
  version: 1,
};
