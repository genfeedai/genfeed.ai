import type { WorkflowTemplate } from '@genfeedai/types';

export const FACECAM_AVATAR_TEMPLATE: WorkflowTemplate = {
  createdAt: new Date().toISOString(),
  description: 'Generate talking head videos from text scripts using ElevenLabs TTS and lip sync',
  edgeStyle: 'smoothstep',
  edges: [
    // Script → Text to Speech
    {
      id: 'e1',
      source: 'script-input',
      sourceHandle: 'text',
      target: 'tts',
      targetHandle: 'text',
    },
    // Text to Speech → Lip Sync (audio)
    {
      id: 'e2',
      source: 'tts',
      sourceHandle: 'audio',
      target: 'lipSync',
      targetHandle: 'audio',
    },
    // Face Image → Lip Sync (image)
    {
      id: 'e3',
      source: 'face-image',
      sourceHandle: 'image',
      target: 'lipSync',
      targetHandle: 'image',
    },
    // Lip Sync → Output
    {
      id: 'e4',
      source: 'lipSync',
      sourceHandle: 'video',
      target: 'output',
      targetHandle: 'video',
    },
  ],
  name: 'Facecam Avatar',
  nodes: [
    // Script Input
    {
      data: {
        label: 'Script',
        prompt: 'Hello! Welcome to my channel. Today I want to share something exciting with you.',
        status: 'idle',
        variables: {},
      },
      id: 'script-input',
      position: { x: 50, y: 100 },
      type: 'prompt',
    },
    // Face Image Input
    {
      data: {
        dimensions: null,
        filename: null,
        image: null,
        label: 'Face Image',
        source: 'upload',
        status: 'idle',
      },
      id: 'face-image',
      position: { x: 50, y: 350 },
      type: 'imageInput',
    },
    // Text to Speech
    {
      data: {
        comment: 'Requires ELEVENLABS_API_KEY. Use Audio Input below as alternative.',
        inputText: null,
        jobId: null,
        label: 'Text to Speech',
        outputAudio: null,
        provider: 'elevenlabs',
        similarityBoost: 0.75,
        speed: 1.0,
        stability: 0.5,
        status: 'idle',
        voice: 'rachel',
      },
      id: 'tts',
      position: { x: 400, y: 100 },
      type: 'textToSpeech',
    },
    // Alternative: Audio Input (for when TTS is not configured)
    {
      data: {
        audio: null,
        comment: 'Upload your own audio instead of TTS. Connect to Lip Sync audio input.',
        duration: null,
        filename: null,
        label: 'Voice Audio (Alternative)',
        source: 'upload',
        status: 'idle',
      },
      id: 'audio-alt',
      position: { x: 400, y: 350 },
      type: 'audioInput',
    },
    // Lip Sync (OmniHuman for image input, Sync Labs for video input)
    {
      data: {
        activeSpeaker: false,
        inputAudio: null,
        inputImage: null,
        inputVideo: null,
        jobId: null,
        label: 'Lip Sync Generator',
        model: 'bytedance/omni-human',
        outputVideo: null,
        status: 'idle',
        syncMode: 'loop',
        temperature: 0.5,
      },
      id: 'lipSync',
      position: { x: 750, y: 200 },
      type: 'lipSync',
    },
    // Output
    {
      data: {
        inputMedia: null,
        inputType: 'video',
        label: 'Talking Head Video',
        outputName: 'facecam-avatar',
        status: 'idle',
      },
      id: 'output',
      position: { x: 1100, y: 200 },
      type: 'download',
    },
  ],
  updatedAt: new Date().toISOString(),
  version: 1,
};
