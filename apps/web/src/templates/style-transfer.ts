import type { WorkflowTemplate } from '@genfeedai/types';

export const STYLE_TRANSFER_TEMPLATE: WorkflowTemplate = {
  createdAt: new Date().toISOString(),
  description: 'Apply a new style to your reference image while preserving the subject identity',
  edgeStyle: 'smoothstep',
  edges: [
    {
      id: 'e-ref-gen',
      source: 'reference-image',
      sourceHandle: 'image',
      target: 'imageGen-1',
      targetHandle: 'images',
    },
    {
      id: 'e-prompt-gen',
      source: 'style-prompt',
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
  name: 'Style Transfer',
  nodes: [
    {
      data: {
        dimensions: null,
        filename: null,
        image: null,
        label: 'Reference Image',
        source: 'upload',
        status: 'idle',
      },
      id: 'reference-image',
      position: { x: 50, y: 100 },
      type: 'imageInput',
    },
    {
      data: {
        label: 'Style Prompt',
        prompt:
          'Transform the subject into a vibrant watercolor painting style with soft brushstrokes and rich colors',
        status: 'idle',
        variables: {},
      },
      id: 'style-prompt',
      position: { x: 50, y: 350 },
      type: 'prompt',
    },
    {
      data: {
        aspectRatio: '1:1',
        inputImages: [],
        inputPrompt: null,
        jobId: null,
        label: 'Style Transfer',
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
        label: 'Styled Output',
        outputName: 'style-transfer',
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
