import type { WorkflowTemplate } from '@genfeedai/types';

export const CHARACTER_VARIATIONS_TEMPLATE: WorkflowTemplate = {
  createdAt: new Date().toISOString(),
  description: 'Generate multiple scenes with a consistent character from a single reference photo',
  edgeStyle: 'smoothstep',
  edges: [
    // Reference Image → all 3 image gen nodes
    {
      id: 'e-ref-gen-1',
      source: 'reference-image',
      sourceHandle: 'image',
      target: 'imageGen-1',
      targetHandle: 'images',
    },
    {
      id: 'e-ref-gen-2',
      source: 'reference-image',
      sourceHandle: 'image',
      target: 'imageGen-2',
      targetHandle: 'images',
    },
    {
      id: 'e-ref-gen-3',
      source: 'reference-image',
      sourceHandle: 'image',
      target: 'imageGen-3',
      targetHandle: 'images',
    },
    // Scene prompts → image gen nodes
    {
      id: 'e-prompt-gen-1',
      source: 'prompt-scene-1',
      sourceHandle: 'text',
      target: 'imageGen-1',
      targetHandle: 'prompt',
    },
    {
      id: 'e-prompt-gen-2',
      source: 'prompt-scene-2',
      sourceHandle: 'text',
      target: 'imageGen-2',
      targetHandle: 'prompt',
    },
    {
      id: 'e-prompt-gen-3',
      source: 'prompt-scene-3',
      sourceHandle: 'text',
      target: 'imageGen-3',
      targetHandle: 'prompt',
    },
    // Image gen → outputs
    {
      id: 'e-gen-out-1',
      source: 'imageGen-1',
      sourceHandle: 'image',
      target: 'output-1',
      targetHandle: 'image',
    },
    {
      id: 'e-gen-out-2',
      source: 'imageGen-2',
      sourceHandle: 'image',
      target: 'output-2',
      targetHandle: 'image',
    },
    {
      id: 'e-gen-out-3',
      source: 'imageGen-3',
      sourceHandle: 'image',
      target: 'output-3',
      targetHandle: 'image',
    },
  ],
  name: 'Character Variations',
  nodes: [
    // Reference Image
    {
      data: {
        dimensions: null,
        filename: null,
        image: null,
        label: 'Character Reference',
        source: 'upload',
        status: 'idle',
      },
      id: 'reference-image',
      position: { x: 50, y: 250 },
      type: 'imageInput',
    },
    // Scene Prompts
    {
      data: {
        label: 'Scene 1',
        prompt:
          'The character walking confidently down a city street at golden hour, cinematic lighting',
        status: 'idle',
        variables: {},
      },
      id: 'prompt-scene-1',
      position: { x: 50, y: 50 },
      type: 'prompt',
    },
    {
      data: {
        label: 'Scene 2',
        prompt:
          'The character sitting in a cozy cafe with warm ambient lighting, natural relaxed pose',
        status: 'idle',
        variables: {},
      },
      id: 'prompt-scene-2',
      position: { x: 50, y: 450 },
      type: 'prompt',
    },
    {
      data: {
        label: 'Scene 3',
        prompt:
          'The character standing on a rooftop overlooking the skyline at sunset, dramatic silhouette',
        status: 'idle',
        variables: {},
      },
      id: 'prompt-scene-3',
      position: { x: 50, y: 650 },
      type: 'prompt',
    },
    // Image Gen Nodes (3 parallel)
    {
      data: {
        aspectRatio: '16:9',
        inputImages: [],
        inputPrompt: null,
        jobId: null,
        label: 'Scene 1 Gen',
        model: 'nano-banana-pro',
        outputFormat: 'jpg',
        outputImage: null,
        resolution: '2K',
        status: 'idle',
      },
      id: 'imageGen-1',
      position: { x: 400, y: 50 },
      type: 'imageGen',
    },
    {
      data: {
        aspectRatio: '16:9',
        inputImages: [],
        inputPrompt: null,
        jobId: null,
        label: 'Scene 2 Gen',
        model: 'nano-banana-pro',
        outputFormat: 'jpg',
        outputImage: null,
        resolution: '2K',
        status: 'idle',
      },
      id: 'imageGen-2',
      position: { x: 400, y: 350 },
      type: 'imageGen',
    },
    {
      data: {
        aspectRatio: '16:9',
        inputImages: [],
        inputPrompt: null,
        jobId: null,
        label: 'Scene 3 Gen',
        model: 'nano-banana-pro',
        outputFormat: 'jpg',
        outputImage: null,
        resolution: '2K',
        status: 'idle',
      },
      id: 'imageGen-3',
      position: { x: 400, y: 650 },
      type: 'imageGen',
    },
    // Output Nodes
    {
      data: {
        inputMedia: null,
        inputType: 'image',
        label: 'Scene 1 Output',
        outputName: 'character-scene-1',
        status: 'idle',
      },
      id: 'output-1',
      position: { x: 750, y: 50 },
      type: 'download',
    },
    {
      data: {
        inputMedia: null,
        inputType: 'image',
        label: 'Scene 2 Output',
        outputName: 'character-scene-2',
        status: 'idle',
      },
      id: 'output-2',
      position: { x: 750, y: 350 },
      type: 'download',
    },
    {
      data: {
        inputMedia: null,
        inputType: 'image',
        label: 'Scene 3 Output',
        outputName: 'character-scene-3',
        status: 'idle',
      },
      id: 'output-3',
      position: { x: 750, y: 650 },
      type: 'download',
    },
  ],
  updatedAt: new Date().toISOString(),
  version: 1,
};
