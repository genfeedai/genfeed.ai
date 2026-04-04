import type { WorkflowTemplate } from '@genfeedai/types';

export const SPORTS_BETTING_TEASER_TEMPLATE: WorkflowTemplate = {
  createdAt: new Date().toISOString(),
  description:
    'Hype clip for sports betting events: generate dramatic scenes, animate with fast cuts, overlay odds/CTA text',
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

    // LLM → Videos (motion prompts)
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

    // Stitch → Subtitle
    {
      id: 'e-stitch-subtitle',
      source: 'stitch',
      sourceHandle: 'video',
      target: 'subtitle',
      targetHandle: 'video',
    },

    // LLM → Subtitle (headline text)
    {
      id: 'e-llm-subtitle',
      source: 'llm-scenes',
      sourceHandle: 'text',
      target: 'subtitle',
      targetHandle: 'text',
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
  name: 'Sports Betting Teaser',
  nodes: [
    // Stage 1: Event Description
    {
      data: {
        label: 'Event Description',
        prompt:
          'UFC 310 Main Event: Champion vs Challenger — explosive knockout odds, electric arena atmosphere, dramatic walkout',
        status: 'idle',
        variables: {},
      },
      id: 'concept',
      position: { x: 50, y: 300 },
      type: 'prompt',
    },

    // Stage 2: LLM — generate 2 dramatic scene prompts + headline text
    {
      data: {
        inputPrompt: null,
        jobId: null,
        label: 'Scene & Headline Writer',
        maxTokens: 1024,
        outputText: null,
        status: 'idle',
        systemPrompt: `You are a sports betting content creator. Generate exactly 2 dramatic scene prompts and a bold headline for a betting teaser.

For each scene, provide a detailed image generation prompt with:
- High-energy action shots, dramatic lighting
- 9:16 vertical format for social media
- Sports-specific visual elements

Format:
1. [Scene 1 image prompt — the build-up/anticipation]
2. [Scene 2 image prompt — the climactic action moment]

[HEADLINE] Short, punchy betting CTA with odds format (e.g. "+250 KNOCKOUT") [/HEADLINE]`,
        temperature: 0.8,
        topP: 0.9,
      },
      id: 'llm-scenes',
      position: { x: 350, y: 300 },
      type: 'llm',
    },

    // Stage 3: Image Generation — 2 action shots (9:16 vertical)
    {
      data: {
        aspectRatio: '9:16',
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
      position: { x: 700, y: 150 },
      type: 'imageGen',
    },
    {
      data: {
        aspectRatio: '9:16',
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
      position: { x: 700, y: 450 },
      type: 'imageGen',
    },

    // Stage 4: Video Generation — dynamic motion
    {
      data: {
        aspectRatio: '9:16',
        duration: 5,
        generateAudio: false,
        inputImage: null,
        inputPrompt: null,
        jobId: null,
        label: 'Scene 1 Video',
        lastFrame: null,
        model: 'veo-3.1',
        negativePrompt: 'blurry, distorted, low quality, static',
        outputVideo: null,
        referenceImages: [],
        resolution: '1080p',
        status: 'idle',
      },
      id: 'videoGen-1',
      position: { x: 1050, y: 150 },
      type: 'videoGen',
    },
    {
      data: {
        aspectRatio: '9:16',
        duration: 5,
        generateAudio: false,
        inputImage: null,
        inputPrompt: null,
        jobId: null,
        label: 'Scene 2 Video',
        lastFrame: null,
        model: 'veo-3.1',
        negativePrompt: 'blurry, distorted, low quality, static',
        outputVideo: null,
        referenceImages: [],
        resolution: '1080p',
        status: 'idle',
      },
      id: 'videoGen-2',
      position: { x: 1050, y: 450 },
      type: 'videoGen',
    },

    // Stage 5: Video Stitch — fast cut transitions
    {
      data: {
        audioCodec: 'aac',
        inputVideos: [],
        label: 'Fast Cut Stitch',
        outputQuality: 'full',
        outputVideo: null,
        seamlessLoop: false,
        status: 'idle',
        transitionDuration: 0.2,
        transitionType: 'crossfade',
      },
      id: 'stitch',
      position: { x: 1400, y: 300 },
      type: 'videoStitch',
    },

    // Stage 6: Subtitle — bold overlay with odds/CTA text
    {
      data: {
        backgroundColor: 'rgba(0,0,0,0.6)',
        fontColor: '#FFD700',
        fontFamily: 'Arial',
        fontSize: 48,
        inputText: null,
        inputVideo: null,
        jobId: null,
        label: 'Odds Overlay',
        outputVideo: null,
        position: 'center',
        status: 'idle',
        style: 'modern',
      },
      id: 'subtitle',
      position: { x: 1750, y: 300 },
      type: 'subtitle',
    },

    // Output
    {
      data: {
        inputMedia: null,
        inputType: 'video',
        label: 'Final Teaser',
        outputName: 'sports-betting-teaser',
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
