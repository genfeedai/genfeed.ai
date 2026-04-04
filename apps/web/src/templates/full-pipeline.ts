import type { WorkflowTemplate } from '@genfeedai/types';

export const FULL_PIPELINE_TEMPLATE: WorkflowTemplate = {
  createdAt: new Date().toISOString(),
  description: 'Complete workflow: concept → images → videos → animation → stitched output',
  edgeStyle: 'smoothstep',
  edges: [
    // Concept → LLM
    {
      id: 'e1',
      source: 'concept',
      sourceHandle: 'text',
      target: 'llm-story',
      targetHandle: 'prompt',
    },

    // LLM → Images
    {
      id: 'e2',
      source: 'llm-story',
      sourceHandle: 'text',
      target: 'imageGen-1',
      targetHandle: 'prompt',
    },
    {
      id: 'e3',
      source: 'llm-story',
      sourceHandle: 'text',
      target: 'imageGen-2',
      targetHandle: 'prompt',
    },
    {
      id: 'e4',
      source: 'llm-story',
      sourceHandle: 'text',
      target: 'imageGen-3',
      targetHandle: 'prompt',
    },

    // Images → Videos (interpolation)
    {
      id: 'e5',
      source: 'imageGen-1',
      sourceHandle: 'image',
      target: 'videoGen-1',
      targetHandle: 'image',
    },
    {
      id: 'e6',
      source: 'imageGen-2',
      sourceHandle: 'image',
      target: 'videoGen-1',
      targetHandle: 'lastFrame',
    },
    {
      id: 'e7',
      source: 'imageGen-2',
      sourceHandle: 'image',
      target: 'videoGen-2',
      targetHandle: 'image',
    },
    {
      id: 'e8',
      source: 'imageGen-3',
      sourceHandle: 'image',
      target: 'videoGen-2',
      targetHandle: 'lastFrame',
    },

    // LLM prompts → Videos
    {
      id: 'e9',
      source: 'llm-story',
      sourceHandle: 'text',
      target: 'videoGen-1',
      targetHandle: 'prompt',
    },
    {
      id: 'e10',
      source: 'llm-story',
      sourceHandle: 'text',
      target: 'videoGen-2',
      targetHandle: 'prompt',
    },

    // Videos → Animation
    {
      id: 'e11',
      source: 'videoGen-1',
      sourceHandle: 'video',
      target: 'animation-1',
      targetHandle: 'video',
    },
    {
      id: 'e12',
      source: 'videoGen-2',
      sourceHandle: 'video',
      target: 'animation-2',
      targetHandle: 'video',
    },

    // Animation → Stitch
    {
      id: 'e13',
      source: 'animation-1',
      sourceHandle: 'video',
      target: 'stitch-1',
      targetHandle: 'videos',
    },
    {
      id: 'e14',
      source: 'animation-2',
      sourceHandle: 'video',
      target: 'stitch-1',
      targetHandle: 'videos',
    },

    // Stitch → Output
    {
      id: 'e15',
      source: 'stitch-1',
      sourceHandle: 'video',
      target: 'output-1',
      targetHandle: 'video',
    },
  ],
  name: 'Full Content Pipeline',
  nodes: [
    // Stage 1: Concept Development
    {
      data: {
        label: 'Concept',
        prompt:
          'Create a 3-scene story about a robot discovering nature for the first time. Scene 1: Robot in city. Scene 2: Robot enters forest. Scene 3: Robot watches sunset.',
        status: 'idle',
        variables: {},
      },
      id: 'concept',
      position: { x: 50, y: 300 },
      type: 'prompt',
    },
    {
      data: {
        inputPrompt: null,
        jobId: null,
        label: 'Story Expander',
        maxTokens: 2048,
        outputText: null,
        status: 'idle',
        systemPrompt:
          'Expand the concept into 3 detailed visual prompts. For each scene, include: setting, lighting, mood, camera angle, and specific details. Number each 1., 2., 3.',
        temperature: 0.8,
        topP: 0.9,
      },
      id: 'llm-story',
      position: { x: 350, y: 300 },
      type: 'llm',
    },

    // Stage 2: Image Generation
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

    // Stage 3: Video Generation (interpolation between scenes)
    {
      data: {
        aspectRatio: '16:9',
        duration: 6,
        generateAudio: true,
        inputImage: null,
        inputPrompt: null,
        jobId: null,
        label: 'Scene 1→2 Video',
        lastFrame: null,
        model: 'veo-3.1',
        negativePrompt: '',
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
        aspectRatio: '16:9',
        duration: 6,
        generateAudio: true,
        inputImage: null,
        inputPrompt: null,
        jobId: null,
        label: 'Scene 2→3 Video',
        lastFrame: null,
        model: 'veo-3.1',
        negativePrompt: '',
        outputVideo: null,
        referenceImages: [],
        resolution: '1080p',
        status: 'idle',
      },
      id: 'videoGen-2',
      position: { x: 1050, y: 400 },
      type: 'videoGen',
    },

    // Stage 4: Animation (easing)
    {
      data: {
        curveType: 'preset',
        customCurve: [0.645, 0.045, 0.355, 1],
        inputVideo: null,
        label: 'Ease Animation 1',
        outputVideo: null,
        preset: 'easeInOutCubic',
        speedMultiplier: 1,
        status: 'idle',
      },
      id: 'animation-1',
      position: { x: 1400, y: 150 },
      type: 'animation',
    },
    {
      data: {
        curveType: 'preset',
        customCurve: [0.645, 0.045, 0.355, 1],
        inputVideo: null,
        label: 'Ease Animation 2',
        outputVideo: null,
        preset: 'easeInOutCubic',
        speedMultiplier: 1,
        status: 'idle',
      },
      id: 'animation-2',
      position: { x: 1400, y: 400 },
      type: 'animation',
    },

    // Stage 5: Stitching
    {
      data: {
        audioCodec: 'aac',
        inputVideos: [],
        label: 'Video Stitcher',
        outputQuality: 'full',
        outputVideo: null,
        seamlessLoop: true,
        status: 'idle',
        transitionDuration: 0.5,
        transitionType: 'crossfade',
      },
      id: 'stitch-1',
      position: { x: 1750, y: 275 },
      type: 'videoStitch',
    },

    // Output
    {
      data: {
        inputMedia: null,
        inputType: 'video',
        label: 'Final Video',
        outputName: 'full-pipeline-output',
        status: 'idle',
      },
      id: 'output-1',
      position: { x: 2100, y: 275 },
      type: 'download',
    },
  ],
  updatedAt: new Date().toISOString(),
  version: 1,
};
