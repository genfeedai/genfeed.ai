import type { WorkflowTemplate } from '@genfeedai/types';

export const EXTENDED_VIDEO_TEMPLATE: WorkflowTemplate = {
  createdAt: new Date().toISOString(),
  description:
    'Generate a longer video by chaining video segments: create first segment, extract last frame, generate continuation prompt, create second segment, and stitch together',
  edgeStyle: 'smoothstep',
  edges: [
    // Prompt -> First VideoGen
    {
      id: 'e1',
      source: 'prompt-1',
      sourceHandle: 'text',
      target: 'videoGen-1',
      targetHandle: 'prompt',
    },
    // First VideoGen -> Frame Extract
    {
      id: 'e2',
      source: 'videoGen-1',
      sourceHandle: 'video',
      target: 'frameExtract-1',
      targetHandle: 'video',
    },
    // Original Prompt -> LLM (for context)
    {
      id: 'e3',
      source: 'prompt-1',
      sourceHandle: 'text',
      target: 'llm-1',
      targetHandle: 'prompt',
    },
    // Frame Extract -> Second VideoGen (as starting image)
    {
      id: 'e4',
      source: 'frameExtract-1',
      sourceHandle: 'image',
      target: 'videoGen-2',
      targetHandle: 'image',
    },
    // LLM -> Second VideoGen (continuation prompt)
    {
      id: 'e5',
      source: 'llm-1',
      sourceHandle: 'text',
      target: 'videoGen-2',
      targetHandle: 'prompt',
    },
    // First VideoGen -> Stitch
    {
      id: 'e6',
      source: 'videoGen-1',
      sourceHandle: 'video',
      target: 'stitch-1',
      targetHandle: 'videos',
    },
    // Second VideoGen -> Stitch
    {
      id: 'e7',
      source: 'videoGen-2',
      sourceHandle: 'video',
      target: 'stitch-1',
      targetHandle: 'videos',
    },
    // Stitch -> Output
    {
      id: 'e8',
      source: 'stitch-1',
      sourceHandle: 'video',
      target: 'output-1',
      targetHandle: 'video',
    },
  ],
  name: 'Extended Video Pipeline',
  nodes: [
    // Input: Initial Prompt
    {
      data: {
        label: 'Scene Prompt',
        prompt:
          'A majestic eagle soaring through mountain clouds at sunrise, cinematic drone shot, golden hour lighting',
        status: 'idle',
        variables: {},
      },
      id: 'prompt-1',
      position: { x: 50, y: 200 },
      type: 'prompt',
    },
    // First Video Generation
    {
      data: {
        aspectRatio: '16:9',
        duration: 8,
        generateAudio: true,
        inputImage: null,
        inputPrompt: null,
        jobId: null,
        label: 'Video Segment 1',
        lastFrame: null,
        model: 'veo-3.1-fast',
        negativePrompt: '',
        outputVideo: null,
        referenceImages: [],
        resolution: '1080p',
        status: 'idle',
      },
      id: 'videoGen-1',
      position: { x: 350, y: 200 },
      type: 'videoGen',
    },
    // Frame Extraction from first video
    {
      data: {
        inputVideo: null,
        jobId: null,
        label: 'Extract Last Frame',
        outputImage: null,
        percentagePosition: 100,
        selectionMode: 'last',
        status: 'idle',
        timestampSeconds: 0,
        videoDuration: null,
      },
      id: 'frameExtract-1',
      position: { x: 650, y: 200 },
      type: 'videoFrameExtract',
    },
    // LLM for continuation prompt
    {
      data: {
        inputPrompt: null,
        jobId: null,
        label: 'Continuation Prompt',
        maxTokens: 256,
        outputText: null,
        status: 'idle',
        systemPrompt:
          'You are a video director. Given a scene description, write a continuation that naturally follows the action. Keep the same style, setting, and subject. Output only the prompt, no explanations. The continuation should feel like a seamless extension of the scene.',
        temperature: 0.7,
        topP: 0.9,
      },
      id: 'llm-1',
      position: { x: 650, y: 400 },
      type: 'llm',
    },
    // Second Video Generation (uses last frame + continuation prompt)
    {
      data: {
        aspectRatio: '16:9',
        duration: 8,
        generateAudio: true,
        inputImage: null,
        inputPrompt: null,
        jobId: null,
        label: 'Video Segment 2',
        lastFrame: null,
        model: 'veo-3.1-fast',
        negativePrompt: '',
        outputVideo: null,
        referenceImages: [],
        resolution: '1080p',
        status: 'idle',
      },
      id: 'videoGen-2',
      position: { x: 950, y: 300 },
      type: 'videoGen',
    },
    // Video Stitch
    {
      data: {
        audioCodec: 'aac',
        inputVideos: [],
        label: 'Combine Segments',
        outputQuality: 'full',
        outputVideo: null,
        seamlessLoop: false,
        status: 'idle',
        transitionDuration: 0.3,
        transitionType: 'crossfade',
      },
      id: 'stitch-1',
      position: { x: 1250, y: 250 },
      type: 'videoStitch',
    },
    // Output
    {
      data: {
        inputMedia: null,
        inputType: 'video',
        label: 'Extended Video',
        outputName: 'extended-video-output',
        status: 'idle',
      },
      id: 'output-1',
      position: { x: 1550, y: 250 },
      type: 'download',
    },
  ],
  updatedAt: new Date().toISOString(),
  version: 1,
};
