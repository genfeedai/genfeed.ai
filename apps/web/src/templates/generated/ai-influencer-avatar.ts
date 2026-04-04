import type { WorkflowTemplate } from '@genfeedai/types';

export const AI_INFLUENCER_AVATAR_TEMPLATE: WorkflowTemplate = {
  createdAt: new Date().toISOString(),
  description:
    'Generate a consistent AI influencer avatar and create multiple scene/pose variations using that avatar as reference for character consistency',
  edgeStyle: 'smoothstep',
  edges: [
    // Avatar generation chain
    {
      id: 'e-avatar-llm',
      source: 'prompt-avatar',
      sourceHandle: 'text',
      target: 'llm-avatar',
      targetHandle: 'prompt',
    },
    {
      id: 'e-llm-imagegen',
      source: 'llm-avatar',
      sourceHandle: 'text',
      target: 'imagegen-avatar',
      targetHandle: 'prompt',
    },
    {
      id: 'e-avatar-output',
      source: 'imagegen-avatar',
      sourceHandle: 'image',
      target: 'output-avatar',
      targetHandle: 'image',
    },
    // Scene prompts → ImageGen
    {
      id: 'e-scene1-prompt',
      source: 'prompt-scene-1',
      sourceHandle: 'text',
      target: 'imagegen-scene-1',
      targetHandle: 'prompt',
    },
    {
      id: 'e-scene2-prompt',
      source: 'prompt-scene-2',
      sourceHandle: 'text',
      target: 'imagegen-scene-2',
      targetHandle: 'prompt',
    },
    {
      id: 'e-scene3-prompt',
      source: 'prompt-scene-3',
      sourceHandle: 'text',
      target: 'imagegen-scene-3',
      targetHandle: 'prompt',
    },
    {
      id: 'e-scene4-prompt',
      source: 'prompt-scene-4',
      sourceHandle: 'text',
      target: 'imagegen-scene-4',
      targetHandle: 'prompt',
    },
    // Avatar reference → All scene ImageGens (character consistency)
    {
      id: 'e-avatar-ref-1',
      source: 'imagegen-avatar',
      sourceHandle: 'image',
      target: 'imagegen-scene-1',
      targetHandle: 'images',
    },
    {
      id: 'e-avatar-ref-2',
      source: 'imagegen-avatar',
      sourceHandle: 'image',
      target: 'imagegen-scene-2',
      targetHandle: 'images',
    },
    {
      id: 'e-avatar-ref-3',
      source: 'imagegen-avatar',
      sourceHandle: 'image',
      target: 'imagegen-scene-3',
      targetHandle: 'images',
    },
    {
      id: 'e-avatar-ref-4',
      source: 'imagegen-avatar',
      sourceHandle: 'image',
      target: 'imagegen-scene-4',
      targetHandle: 'images',
    },
    // Scene ImageGens → Outputs
    {
      id: 'e-scene1-output',
      source: 'imagegen-scene-1',
      sourceHandle: 'image',
      target: 'output-scene-1',
      targetHandle: 'image',
    },
    {
      id: 'e-scene2-output',
      source: 'imagegen-scene-2',
      sourceHandle: 'image',
      target: 'output-scene-2',
      targetHandle: 'image',
    },
    {
      id: 'e-scene3-output',
      source: 'imagegen-scene-3',
      sourceHandle: 'image',
      target: 'output-scene-3',
      targetHandle: 'image',
    },
    {
      id: 'e-scene4-output',
      source: 'imagegen-scene-4',
      sourceHandle: 'image',
      target: 'output-scene-4',
      targetHandle: 'image',
    },
  ],
  name: 'AI Influencer Avatar',
  nodes: [
    // Avatar Description Prompt
    {
      data: {
        label: 'Avatar Description',
        prompt:
          'A young woman with brown hair, warm smile, modern casual style, approachable and confident',
        status: 'idle',
        variables: {},
      },
      id: 'prompt-avatar',
      position: { x: 50, y: 50 },
      type: 'prompt',
    },
    // LLM to refine avatar prompt
    {
      data: {
        inputPrompt: null,
        jobId: null,
        label: 'Refine Avatar',
        maxTokens: 256,
        outputText: null,
        status: 'idle',
        systemPrompt:
          "You are a portrait photography expert. Take the user's character description and create a detailed, generation-optimized prompt for creating a consistent AI influencer avatar. Focus on: facial features, hair style/color, skin tone, expression, clothing style, and overall aesthetic. Keep it concise (under 100 words). Start directly with the description, no preamble.",
        temperature: 0.7,
        topP: 0.9,
      },
      id: 'llm-avatar',
      position: { x: 350, y: 50 },
      type: 'llm',
    },
    // Generate Base Avatar
    {
      data: {
        aspectRatio: '1:1',
        inputImages: [],
        inputPrompt: null,
        jobId: null,
        label: 'Generate Avatar',
        model: 'nano-banana-pro',
        outputFormat: 'jpg',
        outputImage: null,
        resolution: '2K',
        status: 'idle',
      },
      id: 'imagegen-avatar',
      position: { x: 650, y: 50 },
      type: 'imageGen',
    },
    // Avatar Output
    {
      data: {
        inputMedia: null,
        inputType: 'image',
        label: 'Base Avatar',
        outputName: 'base-avatar',
        status: 'idle',
      },
      id: 'output-avatar',
      position: { x: 1250, y: 50 },
      type: 'download',
    },
    // Scene 1: Beach
    {
      data: {
        label: 'Beach Scene',
        prompt:
          'On a sunny tropical beach, wearing summer outfit, relaxed vacation pose, ocean waves in background',
        status: 'idle',
        variables: {},
      },
      id: 'prompt-scene-1',
      position: { x: 50, y: 250 },
      type: 'prompt',
    },
    {
      data: {
        aspectRatio: '4:5',
        inputImages: [],
        inputPrompt: null,
        jobId: null,
        label: 'Beach Variation',
        model: 'nano-banana-pro',
        outputFormat: 'jpg',
        outputImage: null,
        resolution: '2K',
        status: 'idle',
      },
      id: 'imagegen-scene-1',
      position: { x: 650, y: 250 },
      type: 'imageGen',
    },
    {
      data: {
        inputMedia: null,
        inputType: 'image',
        label: 'Beach Output',
        outputName: 'scene-beach',
        status: 'idle',
      },
      id: 'output-scene-1',
      position: { x: 1250, y: 250 },
      type: 'download',
    },
    // Scene 2: Office
    {
      data: {
        label: 'Office Scene',
        prompt:
          'In a modern office, professional attire, confident business pose, clean minimal workspace background',
        status: 'idle',
        variables: {},
      },
      id: 'prompt-scene-2',
      position: { x: 50, y: 450 },
      type: 'prompt',
    },
    {
      data: {
        aspectRatio: '4:5',
        inputImages: [],
        inputPrompt: null,
        jobId: null,
        label: 'Office Variation',
        model: 'nano-banana-pro',
        outputFormat: 'jpg',
        outputImage: null,
        resolution: '2K',
        status: 'idle',
      },
      id: 'imagegen-scene-2',
      position: { x: 650, y: 450 },
      type: 'imageGen',
    },
    {
      data: {
        inputMedia: null,
        inputType: 'image',
        label: 'Office Output',
        outputName: 'scene-office',
        status: 'idle',
      },
      id: 'output-scene-2',
      position: { x: 1250, y: 450 },
      type: 'download',
    },
    // Scene 3: Outdoor
    {
      data: {
        label: 'Outdoor Scene',
        prompt:
          'In a beautiful park or garden, athleisure wear, active healthy lifestyle pose, natural greenery background',
        status: 'idle',
        variables: {},
      },
      id: 'prompt-scene-3',
      position: { x: 50, y: 650 },
      type: 'prompt',
    },
    {
      data: {
        aspectRatio: '4:5',
        inputImages: [],
        inputPrompt: null,
        jobId: null,
        label: 'Outdoor Variation',
        model: 'nano-banana-pro',
        outputFormat: 'jpg',
        outputImage: null,
        resolution: '2K',
        status: 'idle',
      },
      id: 'imagegen-scene-3',
      position: { x: 650, y: 650 },
      type: 'imageGen',
    },
    {
      data: {
        inputMedia: null,
        inputType: 'image',
        label: 'Outdoor Output',
        outputName: 'scene-outdoor',
        status: 'idle',
      },
      id: 'output-scene-3',
      position: { x: 1250, y: 650 },
      type: 'download',
    },
    // Scene 4: Casual
    {
      data: {
        label: 'Casual Scene',
        prompt:
          'At a cozy cafe, casual streetwear, relaxed candid pose, warm coffee shop ambiance background',
        status: 'idle',
        variables: {},
      },
      id: 'prompt-scene-4',
      position: { x: 50, y: 850 },
      type: 'prompt',
    },
    {
      data: {
        aspectRatio: '4:5',
        inputImages: [],
        inputPrompt: null,
        jobId: null,
        label: 'Casual Variation',
        model: 'nano-banana-pro',
        outputFormat: 'jpg',
        outputImage: null,
        resolution: '2K',
        status: 'idle',
      },
      id: 'imagegen-scene-4',
      position: { x: 650, y: 850 },
      type: 'imageGen',
    },
    {
      data: {
        inputMedia: null,
        inputType: 'image',
        label: 'Casual Output',
        outputName: 'scene-casual',
        status: 'idle',
      },
      id: 'output-scene-4',
      position: { x: 1250, y: 850 },
      type: 'download',
    },
  ],
  updatedAt: new Date().toISOString(),
  version: 1,
};
