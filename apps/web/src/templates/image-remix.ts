import type { WorkflowTemplate } from '@genfeedai/types';

export const IMAGE_REMIX_TEMPLATE: WorkflowTemplate = {
  createdAt: new Date().toISOString(),
  description: 'Reimagine your image in a new style while keeping the overall composition',
  edgeStyle: 'smoothstep',
  edges: [
    {
      id: 'e-src-gen',
      source: 'source-image',
      sourceHandle: 'image',
      target: 'imageGen-1',
      targetHandle: 'images',
    },
    {
      id: 'e-prompt-gen',
      source: 'remix-prompt',
      sourceHandle: 'text',
      target: 'imageGen-1',
      targetHandle: 'prompt',
    },
    {
      id: 'e-gen-output',
      source: 'imageGen-1',
      sourceHandle: 'image',
      target: 'output-1',
      targetHandle: 'image',
    },
  ],
  name: 'Image Remix',
  nodes: [
    {
      data: {
        dimensions: null,
        filename: null,
        image: null,
        label: 'Source Image',
        source: 'upload',
        status: 'idle',
      },
      id: 'source-image',
      position: { x: 50, y: 150 },
      type: 'imageInput',
    },
    {
      data: {
        label: 'Remix Prompt',
        prompt:
          'Reimagine this image as a stylized digital illustration with bold colors and sharp details',
        status: 'idle',
        variables: {},
      },
      id: 'remix-prompt',
      position: { x: 50, y: 400 },
      type: 'prompt',
    },
    {
      data: {
        aspectRatio: '16:9',
        inputImages: [],
        inputPrompt: null,
        jobId: null,
        label: 'Image Remix',
        model: 'nano-banana-pro',
        outputFormat: 'jpg',
        outputImage: null,
        resolution: '2K',
        status: 'idle',
      },
      id: 'imageGen-1',
      position: { x: 400, y: 200 },
      type: 'imageGen',
    },
    {
      data: {
        inputMedia: null,
        inputType: 'image',
        label: 'Remixed Output',
        outputName: 'image-remix',
        status: 'idle',
      },
      id: 'output-1',
      position: { x: 750, y: 200 },
      type: 'download',
    },
  ],
  updatedAt: new Date().toISOString(),
  version: 1,
};
