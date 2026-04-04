import type { WorkflowTemplate } from '@genfeedai/types';

export const SOCIAL_TEASER_CLIP_TEMPLATE: WorkflowTemplate = {
  createdAt: new Date().toISOString(),
  description:
    'Quick teaser clip for Twitter/Instagram: animate a single photo, upscale quality, add bold CTA overlay',
  edgeStyle: 'smoothstep',
  edges: [
    // Image → Video
    {
      id: 'e-img-vid',
      source: 'image-input',
      sourceHandle: 'image',
      target: 'videoGen',
      targetHandle: 'image',
    },

    // Video → Upscale
    {
      id: 'e-vid-upscale',
      source: 'videoGen',
      sourceHandle: 'video',
      target: 'upscale',
      targetHandle: 'video',
    },

    // CTA Prompt → LLM
    {
      id: 'e-cta-llm',
      source: 'cta-prompt',
      sourceHandle: 'text',
      target: 'llm-hook',
      targetHandle: 'prompt',
    },

    // Upscale → Subtitle
    {
      id: 'e-upscale-subtitle',
      source: 'upscale',
      sourceHandle: 'video',
      target: 'subtitle',
      targetHandle: 'video',
    },

    // LLM → Subtitle (hook text)
    {
      id: 'e-llm-subtitle',
      source: 'llm-hook',
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
  name: 'Social Teaser Clip',
  nodes: [
    // Stage 1: Image Input — single photo
    {
      data: {
        dimensions: null,
        filename: null,
        image: null,
        label: 'Photo',
        source: 'upload',
        status: 'idle',
      },
      id: 'image-input',
      position: { x: 50, y: 200 },
      type: 'imageInput',
    },

    // Stage 2: Video Generation — cinematic motion (9:16)
    {
      data: {
        aspectRatio: '9:16',
        duration: 6,
        generateAudio: false,
        inputImage: null,
        inputPrompt: null,
        jobId: null,
        label: 'Cinematic Motion',
        lastFrame: null,
        model: 'veo-3.1',
        negativePrompt: 'blurry, distorted, low quality, static',
        outputVideo: null,
        referenceImages: [],
        resolution: '1080p',
        status: 'idle',
      },
      id: 'videoGen',
      position: { x: 400, y: 200 },
      type: 'videoGen',
    },

    // Stage 3: Upscale — enhance quality
    {
      data: {
        inputImage: null,
        inputType: 'video',
        inputVideo: null,
        jobId: null,
        label: 'Enhance Quality',
        model: 'topaz-video',
        outputImage: null,
        outputVideo: null,
        status: 'idle',
        upscaleFactor: '2x',
      },
      id: 'upscale',
      position: { x: 750, y: 200 },
      type: 'upscale',
    },

    // Stage 4: CTA Prompt
    {
      data: {
        label: 'CTA Text',
        prompt:
          'Generate a short, catchy hook line for a social media teaser — something that grabs attention',
        status: 'idle',
        variables: {},
      },
      id: 'cta-prompt',
      position: { x: 50, y: 450 },
      type: 'prompt',
    },

    // Stage 5: LLM — generate short hook line
    {
      data: {
        inputPrompt: null,
        jobId: null,
        label: 'Hook Generator',
        maxTokens: 128,
        outputText: null,
        status: 'idle',
        systemPrompt:
          'You are a social media copywriter. Generate a single punchy hook line (max 10 words) that creates urgency and curiosity. No hashtags. Output only the hook text.',
        temperature: 0.9,
        topP: 0.9,
      },
      id: 'llm-hook',
      position: { x: 400, y: 450 },
      type: 'llm',
    },

    // Stage 6: Subtitle — bold CTA overlay at bottom
    {
      data: {
        backgroundColor: 'rgba(0,0,0,0.7)',
        fontColor: '#FFFFFF',
        fontFamily: 'Arial',
        fontSize: 40,
        inputText: null,
        inputVideo: null,
        jobId: null,
        label: 'CTA Overlay',
        outputVideo: null,
        position: 'bottom',
        status: 'idle',
        style: 'modern',
      },
      id: 'subtitle',
      position: { x: 1100, y: 300 },
      type: 'subtitle',
    },

    // Output
    {
      data: {
        inputMedia: null,
        inputType: 'video',
        label: 'Final Teaser',
        outputName: 'social-teaser-clip',
        status: 'idle',
      },
      id: 'output',
      position: { x: 1450, y: 300 },
      type: 'download',
    },
  ],
  updatedAt: new Date().toISOString(),
  version: 1,
};
