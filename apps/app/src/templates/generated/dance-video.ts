import type { WorkflowTemplate } from '@genfeedai/types';

export const DANCE_VIDEO_TEMPLATE: WorkflowTemplate = {
  createdAt: new Date().toISOString(),
  description:
    'Apply dance or motion from a reference video to a static image using Kling v2.6 motion control',
  edgeStyle: 'smoothstep',
  edges: [
    // Subject Image → Motion Control
    {
      id: 'e1',
      source: 'subject-image',
      sourceHandle: 'image',
      target: 'motion-control',
      targetHandle: 'image',
    },
    // Motion Video → Motion Control
    {
      id: 'e2',
      source: 'motion-video',
      sourceHandle: 'video',
      target: 'motion-control',
      targetHandle: 'video',
    },
    // Prompt → Motion Control
    {
      id: 'e3',
      source: 'prompt',
      sourceHandle: 'text',
      target: 'motion-control',
      targetHandle: 'prompt',
    },
    // Motion Control → Output
    {
      id: 'e4',
      source: 'motion-control',
      sourceHandle: 'video',
      target: 'output',
      targetHandle: 'video',
    },
  ],
  name: 'Dance Video',
  nodes: [
    // Subject Image Input
    {
      data: {
        dimensions: null,
        filename: null,
        image: null,
        label: 'Subject Image',
        source: 'upload',
        status: 'idle',
      },
      id: 'subject-image',
      position: { x: 50, y: 100 },
      type: 'imageInput',
    },
    // Motion Video Input
    {
      data: {
        dimensions: null,
        duration: null,
        filename: null,
        label: 'Dance/Motion Video',
        source: 'upload',
        status: 'idle',
        video: null,
      },
      id: 'motion-video',
      position: { x: 50, y: 350 },
      type: 'videoInput',
    },
    // Optional Prompt
    {
      data: {
        label: 'Enhancement Prompt',
        prompt: 'Professional dance performance, smooth motion, high quality, detailed',
        status: 'idle',
        variables: {},
      },
      id: 'prompt',
      position: { x: 50, y: 550 },
      type: 'prompt',
    },
    // Motion Control Node (Kling v2.6)
    {
      data: {
        aspectRatio: '9:16',
        cameraIntensity: 50,
        cameraMovement: 'static',
        characterOrientation: 'image',
        duration: 5,
        inputImage: null,
        inputPrompt: null,
        inputVideo: null,
        jobId: null,
        keepOriginalSound: true,
        label: 'Motion Control',
        mode: 'video_transfer',
        motionStrength: 50,
        negativePrompt: 'blurry, distorted, low quality',
        outputVideo: null,
        qualityMode: 'pro',
        seed: null,
        status: 'idle',
        trajectoryPoints: [],
      },
      id: 'motion-control',
      position: { x: 400, y: 200 },
      type: 'motionControl',
    },
    // Output
    {
      data: {
        inputMedia: null,
        inputType: 'video',
        label: 'Dance Video',
        outputName: 'dance-video',
        status: 'idle',
      },
      id: 'output',
      position: { x: 750, y: 200 },
      type: 'download',
    },
  ],
  updatedAt: new Date().toISOString(),
  version: 1,
};
