import type { WorkflowTemplate } from '@genfeedai/types';

export const STREAMER_HIGHLIGHT_REEL_TEMPLATE: WorkflowTemplate = {
  createdAt: new Date().toISOString(),
  description:
    'Repurpose stream footage into social-ready clips: transcribe key moments, trim highlights, stitch with captions, resize for TikTok/Reels',
  edgeStyle: 'smoothstep',
  edges: [
    // Video Input → Transcribe
    {
      id: 'e-input-transcribe',
      source: 'video-input',
      sourceHandle: 'video',
      target: 'transcribe',
      targetHandle: 'video',
    },

    // Video Input → Trims
    {
      id: 'e-input-trim1',
      source: 'video-input',
      sourceHandle: 'video',
      target: 'trim-1',
      targetHandle: 'video',
    },
    {
      id: 'e-input-trim2',
      source: 'video-input',
      sourceHandle: 'video',
      target: 'trim-2',
      targetHandle: 'video',
    },
    {
      id: 'e-input-trim3',
      source: 'video-input',
      sourceHandle: 'video',
      target: 'trim-3',
      targetHandle: 'video',
    },

    // Trims → Stitch
    {
      id: 'e-trim1-stitch',
      source: 'trim-1',
      sourceHandle: 'video',
      target: 'stitch',
      targetHandle: 'videos',
    },
    {
      id: 'e-trim2-stitch',
      source: 'trim-2',
      sourceHandle: 'video',
      target: 'stitch',
      targetHandle: 'videos',
    },
    {
      id: 'e-trim3-stitch',
      source: 'trim-3',
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

    // Transcribe → Subtitle (caption text)
    {
      id: 'e-transcribe-subtitle',
      source: 'transcribe',
      sourceHandle: 'text',
      target: 'subtitle',
      targetHandle: 'text',
    },

    // Subtitle → Resize
    {
      id: 'e-subtitle-resize',
      source: 'subtitle',
      sourceHandle: 'video',
      target: 'resize',
      targetHandle: 'video',
    },

    // Resize → Output
    {
      id: 'e-resize-output',
      source: 'resize',
      sourceHandle: 'video',
      target: 'output',
      targetHandle: 'video',
    },
  ],
  name: 'Streamer Highlight Reel',
  nodes: [
    // Stage 1: Video Input — raw stream footage
    {
      data: {
        dimensions: null,
        duration: null,
        filename: null,
        label: 'Stream Footage',
        source: 'upload',
        status: 'idle',
        video: null,
      },
      id: 'video-input',
      position: { x: 50, y: 300 },
      type: 'videoInput',
    },

    // Stage 2: Transcribe — find key moments
    {
      data: {
        inputAudio: null,
        inputVideo: null,
        jobId: null,
        label: 'Find Key Moments',
        language: 'auto',
        outputText: null,
        status: 'idle',
        timestamps: true,
      },
      id: 'transcribe',
      position: { x: 350, y: 300 },
      type: 'transcribe',
    },

    // Stage 3: Video Trim — extract 3 highlights
    {
      data: {
        duration: null,
        endTime: 60,
        inputVideo: null,
        jobId: null,
        label: 'Highlight 1',
        outputVideo: null,
        startTime: 0,
        status: 'idle',
      },
      id: 'trim-1',
      position: { x: 700, y: 100 },
      type: 'videoTrim',
    },
    {
      data: {
        duration: null,
        endTime: 360,
        inputVideo: null,
        jobId: null,
        label: 'Highlight 2',
        outputVideo: null,
        startTime: 300,
        status: 'idle',
      },
      id: 'trim-2',
      position: { x: 700, y: 300 },
      type: 'videoTrim',
    },
    {
      data: {
        duration: null,
        endTime: 960,
        inputVideo: null,
        jobId: null,
        label: 'Highlight 3',
        outputVideo: null,
        startTime: 900,
        status: 'idle',
      },
      id: 'trim-3',
      position: { x: 700, y: 500 },
      type: 'videoTrim',
    },

    // Stage 4: Video Stitch — crossfade compilation
    {
      data: {
        audioCodec: 'aac',
        inputVideos: [],
        label: 'Compilation Stitch',
        outputQuality: 'full',
        outputVideo: null,
        seamlessLoop: false,
        status: 'idle',
        transitionDuration: 0.3,
        transitionType: 'crossfade',
      },
      id: 'stitch',
      position: { x: 1050, y: 300 },
      type: 'videoStitch',
    },

    // Stage 5: Subtitle — modern captions
    {
      data: {
        backgroundColor: 'rgba(0,0,0,0.5)',
        fontColor: '#FFFFFF',
        fontFamily: 'Arial',
        fontSize: 32,
        inputText: null,
        inputVideo: null,
        jobId: null,
        label: 'Modern Captions',
        outputVideo: null,
        position: 'bottom',
        status: 'idle',
        style: 'modern',
      },
      id: 'subtitle',
      position: { x: 1400, y: 200 },
      type: 'subtitle',
    },

    // Stage 6: Resize — 9:16 for TikTok/Reels
    {
      data: {
        aspectRatio: '9:16',
        gridPosition: 'center',
        inputImage: null,
        inputType: 'video',
        inputVideo: null,
        jobId: null,
        label: 'Resize 9:16',
        outputMedia: null,
        status: 'idle',
      },
      id: 'resize',
      position: { x: 1400, y: 450 },
      type: 'resize',
    },

    // Output
    {
      data: {
        inputMedia: null,
        inputType: 'video',
        label: 'Final Reel',
        outputName: 'streamer-highlight-reel',
        status: 'idle',
      },
      id: 'output',
      position: { x: 1750, y: 300 },
      type: 'download',
    },
  ],
  updatedAt: new Date().toISOString(),
  version: 1,
};
