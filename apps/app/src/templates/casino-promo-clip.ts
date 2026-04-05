import type { WorkflowTemplate } from '@genfeedai/types';

export const CASINO_PROMO_CLIP_TEMPLATE: WorkflowTemplate = {
  createdAt: new Date().toISOString(),
  description:
    'Short-form promo video from a concept: expand into visual scenes, generate imagery, animate, stitch with CTA voiceover',
  edgeStyle: 'smoothstep',
  edges: [
    // Concept → LLM
    {
      id: 'e-concept-llm',
      source: 'concept',
      sourceHandle: 'text',
      target: 'llm-scenes',
      targetHandle: 'prompt',
    },

    // LLM → Images
    {
      id: 'e-llm-img1',
      source: 'llm-scenes',
      sourceHandle: 'text',
      target: 'imageGen-1',
      targetHandle: 'prompt',
    },
    {
      id: 'e-llm-img2',
      source: 'llm-scenes',
      sourceHandle: 'text',
      target: 'imageGen-2',
      targetHandle: 'prompt',
    },
    {
      id: 'e-llm-img3',
      source: 'llm-scenes',
      sourceHandle: 'text',
      target: 'imageGen-3',
      targetHandle: 'prompt',
    },

    // Images → Videos
    {
      id: 'e-img1-vid1',
      source: 'imageGen-1',
      sourceHandle: 'image',
      target: 'videoGen-1',
      targetHandle: 'image',
    },
    {
      id: 'e-img2-vid2',
      source: 'imageGen-2',
      sourceHandle: 'image',
      target: 'videoGen-2',
      targetHandle: 'image',
    },
    {
      id: 'e-img3-vid3',
      source: 'imageGen-3',
      sourceHandle: 'image',
      target: 'videoGen-3',
      targetHandle: 'image',
    },

    // LLM → Videos (prompt for motion)
    {
      id: 'e-llm-vid1',
      source: 'llm-scenes',
      sourceHandle: 'text',
      target: 'videoGen-1',
      targetHandle: 'prompt',
    },
    {
      id: 'e-llm-vid2',
      source: 'llm-scenes',
      sourceHandle: 'text',
      target: 'videoGen-2',
      targetHandle: 'prompt',
    },
    {
      id: 'e-llm-vid3',
      source: 'llm-scenes',
      sourceHandle: 'text',
      target: 'videoGen-3',
      targetHandle: 'prompt',
    },

    // Videos → Stitch
    {
      id: 'e-vid1-stitch',
      source: 'videoGen-1',
      sourceHandle: 'video',
      target: 'stitch',
      targetHandle: 'videos',
    },
    {
      id: 'e-vid2-stitch',
      source: 'videoGen-2',
      sourceHandle: 'video',
      target: 'stitch',
      targetHandle: 'videos',
    },
    {
      id: 'e-vid3-stitch',
      source: 'videoGen-3',
      sourceHandle: 'video',
      target: 'stitch',
      targetHandle: 'videos',
    },

    // LLM → TTS (CTA script)
    {
      id: 'e-llm-tts',
      source: 'llm-scenes',
      sourceHandle: 'text',
      target: 'tts',
      targetHandle: 'text',
    },

    // Stitch + TTS → Voice Mix
    {
      id: 'e-stitch-mix',
      source: 'stitch',
      sourceHandle: 'video',
      target: 'voice-mix',
      targetHandle: 'video',
    },
    {
      id: 'e-tts-mix',
      source: 'tts',
      sourceHandle: 'audio',
      target: 'voice-mix',
      targetHandle: 'audio',
    },

    // Voice Mix → Output
    {
      id: 'e-mix-output',
      source: 'voice-mix',
      sourceHandle: 'video',
      target: 'output',
      targetHandle: 'video',
    },
  ],
  name: 'Casino Promo Clip',
  nodes: [
    // Stage 1: Concept Input
    {
      data: {
        label: 'Promo Concept',
        prompt:
          'New slot game launch: "Golden Dragon Fortune" — neon-lit casino floor, spinning reels with dragon symbols, big win celebration with gold coins erupting',
        status: 'idle',
        variables: {},
      },
      id: 'concept',
      position: { x: 50, y: 300 },
      type: 'prompt',
    },

    // Stage 2: LLM — expand concept into 3 scenes + CTA script
    {
      data: {
        inputPrompt: null,
        jobId: null,
        label: 'Scene & CTA Writer',
        maxTokens: 2048,
        outputText: null,
        status: 'idle',
        systemPrompt: `You are a casino marketing creative director. Expand the concept into exactly 3 visual scenes and a short CTA voiceover script.

For each scene, provide a detailed image generation prompt with:
- Neon casino aesthetic, vibrant lighting, rich colors
- 16:9 cinematic composition
- Specific visual elements (slot machines, cards, chips, lights)

Format:
1. [Scene 1 image prompt]
2. [Scene 2 image prompt]
3. [Scene 3 image prompt]

[CTA] A punchy 10-second voiceover script with urgency and excitement [/CTA]`,
        temperature: 0.8,
        topP: 0.9,
      },
      id: 'llm-scenes',
      position: { x: 350, y: 300 },
      type: 'llm',
    },

    // Stage 3: Image Generation — 3 scene visuals
    {
      data: {
        aspectRatio: '16:9',
        inputImages: [],
        inputPrompt: null,
        jobId: null,
        label: 'Scene 1 Image',
        model: 'nano-banana-pro',
        outputFormat: 'jpg',
        outputImage: null,
        resolution: '2K',
        status: 'idle',
      },
      id: 'imageGen-1',
      position: { x: 700, y: 100 },
      type: 'imageGen',
    },
    {
      data: {
        aspectRatio: '16:9',
        inputImages: [],
        inputPrompt: null,
        jobId: null,
        label: 'Scene 2 Image',
        model: 'nano-banana-pro',
        outputFormat: 'jpg',
        outputImage: null,
        resolution: '2K',
        status: 'idle',
      },
      id: 'imageGen-2',
      position: { x: 700, y: 300 },
      type: 'imageGen',
    },
    {
      data: {
        aspectRatio: '16:9',
        inputImages: [],
        inputPrompt: null,
        jobId: null,
        label: 'Scene 3 Image',
        model: 'nano-banana-pro',
        outputFormat: 'jpg',
        outputImage: null,
        resolution: '2K',
        status: 'idle',
      },
      id: 'imageGen-3',
      position: { x: 700, y: 500 },
      type: 'imageGen',
    },

    // Stage 4: Video Generation — animate each scene
    {
      data: {
        aspectRatio: '16:9',
        duration: 5,
        generateAudio: false,
        inputImage: null,
        inputPrompt: null,
        jobId: null,
        label: 'Scene 1 Video',
        lastFrame: null,
        model: 'veo-3.1',
        negativePrompt: 'blurry, distorted, low quality',
        outputVideo: null,
        referenceImages: [],
        resolution: '1080p',
        status: 'idle',
      },
      id: 'videoGen-1',
      position: { x: 1050, y: 100 },
      type: 'videoGen',
    },
    {
      data: {
        aspectRatio: '16:9',
        duration: 5,
        generateAudio: false,
        inputImage: null,
        inputPrompt: null,
        jobId: null,
        label: 'Scene 2 Video',
        lastFrame: null,
        model: 'veo-3.1',
        negativePrompt: 'blurry, distorted, low quality',
        outputVideo: null,
        referenceImages: [],
        resolution: '1080p',
        status: 'idle',
      },
      id: 'videoGen-2',
      position: { x: 1050, y: 300 },
      type: 'videoGen',
    },
    {
      data: {
        aspectRatio: '16:9',
        duration: 5,
        generateAudio: false,
        inputImage: null,
        inputPrompt: null,
        jobId: null,
        label: 'Scene 3 Video',
        lastFrame: null,
        model: 'veo-3.1',
        negativePrompt: 'blurry, distorted, low quality',
        outputVideo: null,
        referenceImages: [],
        resolution: '1080p',
        status: 'idle',
      },
      id: 'videoGen-3',
      position: { x: 1050, y: 500 },
      type: 'videoGen',
    },

    // Stage 5: Video Stitch — crossfade transitions
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
      position: { x: 1400, y: 300 },
      type: 'videoStitch',
    },

    // Stage 6: Text to Speech — CTA voiceover
    {
      data: {
        inputText: null,
        jobId: null,
        label: 'CTA Voiceover',
        outputAudio: null,
        provider: 'elevenlabs',
        similarityBoost: 0.8,
        speed: 1.1,
        stability: 0.6,
        status: 'idle',
        voice: 'adam',
      },
      id: 'tts',
      position: { x: 1400, y: 550 },
      type: 'textToSpeech',
    },

    // Stage 7: Voice Change — mix voiceover onto stitched video
    {
      data: {
        audioMixLevel: 0.8,
        inputAudio: null,
        inputVideo: null,
        jobId: null,
        label: 'Audio Mixer',
        outputVideo: null,
        preserveOriginalAudio: false,
        status: 'idle',
      },
      id: 'voice-mix',
      position: { x: 1750, y: 300 },
      type: 'voiceChange',
    },

    // Output
    {
      data: {
        inputMedia: null,
        inputType: 'video',
        label: 'Final Promo',
        outputName: 'casino-promo-clip',
        status: 'idle',
      },
      id: 'output',
      position: { x: 2100, y: 300 },
      type: 'download',
    },
  ],
  updatedAt: new Date().toISOString(),
  version: 1,
};
