import type { WorkflowTemplate } from '@genfeedai/types';

export const CAM_PROFILE_PROMO_TEMPLATE: WorkflowTemplate = {
  createdAt: new Date().toISOString(),
  description:
    'Auto-generate profile promo video from photos: animate with cinematic motion, stitch with crossfade, add intro voiceover and handle overlay',
  edgeStyle: 'smoothstep',
  edges: [
    // Images → Videos
    {
      id: 'e-img1-vid1',
      source: 'image-1',
      sourceHandle: 'image',
      target: 'videoGen-1',
      targetHandle: 'image',
    },
    {
      id: 'e-img2-vid2',
      source: 'image-2',
      sourceHandle: 'image',
      target: 'videoGen-2',
      targetHandle: 'image',
    },
    {
      id: 'e-img3-vid3',
      source: 'image-3',
      sourceHandle: 'image',
      target: 'videoGen-3',
      targetHandle: 'image',
    },

    // Videos → Stitch
    {
      id: 'e-vid1-stitch',
      source: 'videoGen-1',
      sourceHandle: 'video',
      target: 'stitch',
      targetHandle: 'videos',
    },
    {
      id: 'e-vid2-stitch',
      source: 'videoGen-2',
      sourceHandle: 'video',
      target: 'stitch',
      targetHandle: 'videos',
    },
    {
      id: 'e-vid3-stitch',
      source: 'videoGen-3',
      sourceHandle: 'video',
      target: 'stitch',
      targetHandle: 'videos',
    },

    // Handle Prompt → TTS
    {
      id: 'e-handle-tts',
      source: 'handle-prompt',
      sourceHandle: 'text',
      target: 'tts',
      targetHandle: 'text',
    },

    // Stitch → Subtitle
    {
      id: 'e-stitch-subtitle',
      source: 'stitch',
      sourceHandle: 'video',
      target: 'subtitle',
      targetHandle: 'video',
    },

    // Handle Prompt → Subtitle (overlay text)
    {
      id: 'e-handle-subtitle',
      source: 'handle-prompt',
      sourceHandle: 'text',
      target: 'subtitle',
      targetHandle: 'text',
    },

    // Subtitle → Voice Mix
    {
      id: 'e-subtitle-mix',
      source: 'subtitle',
      sourceHandle: 'video',
      target: 'voice-mix',
      targetHandle: 'video',
    },

    // TTS → Voice Mix
    {
      id: 'e-tts-mix',
      source: 'tts',
      sourceHandle: 'audio',
      target: 'voice-mix',
      targetHandle: 'audio',
    },

    // Voice Mix → Output
    {
      id: 'e-mix-output',
      source: 'voice-mix',
      sourceHandle: 'video',
      target: 'output',
      targetHandle: 'video',
    },
  ],
  name: 'Cam Profile Promo',
  nodes: [
    // Stage 1: Image Inputs — 3 model/streamer photos
    {
      data: {
        dimensions: null,
        filename: null,
        image: null,
        label: 'Photo 1',
        source: 'upload',
        status: 'idle',
      },
      id: 'image-1',
      position: { x: 50, y: 100 },
      type: 'imageInput',
    },
    {
      data: {
        dimensions: null,
        filename: null,
        image: null,
        label: 'Photo 2',
        source: 'upload',
        status: 'idle',
      },
      id: 'image-2',
      position: { x: 50, y: 300 },
      type: 'imageInput',
    },
    {
      data: {
        dimensions: null,
        filename: null,
        image: null,
        label: 'Photo 3',
        source: 'upload',
        status: 'idle',
      },
      id: 'image-3',
      position: { x: 50, y: 500 },
      type: 'imageInput',
    },

    // Stage 2: Video Generation — subtle cinematic motion from each photo
    {
      data: {
        aspectRatio: '9:16',
        duration: 5,
        generateAudio: false,
        inputImage: null,
        inputPrompt: null,
        jobId: null,
        label: 'Animate Photo 1',
        lastFrame: null,
        model: 'veo-3.1',
        negativePrompt: 'blurry, distorted, low quality',
        outputVideo: null,
        referenceImages: [],
        resolution: '1080p',
        status: 'idle',
      },
      id: 'videoGen-1',
      position: { x: 400, y: 100 },
      type: 'videoGen',
    },
    {
      data: {
        aspectRatio: '9:16',
        duration: 5,
        generateAudio: false,
        inputImage: null,
        inputPrompt: null,
        jobId: null,
        label: 'Animate Photo 2',
        lastFrame: null,
        model: 'veo-3.1',
        negativePrompt: 'blurry, distorted, low quality',
        outputVideo: null,
        referenceImages: [],
        resolution: '1080p',
        status: 'idle',
      },
      id: 'videoGen-2',
      position: { x: 400, y: 300 },
      type: 'videoGen',
    },
    {
      data: {
        aspectRatio: '9:16',
        duration: 5,
        generateAudio: false,
        inputImage: null,
        inputPrompt: null,
        jobId: null,
        label: 'Animate Photo 3',
        lastFrame: null,
        model: 'veo-3.1',
        negativePrompt: 'blurry, distorted, low quality',
        outputVideo: null,
        referenceImages: [],
        resolution: '1080p',
        status: 'idle',
      },
      id: 'videoGen-3',
      position: { x: 400, y: 500 },
      type: 'videoGen',
    },

    // Stage 3: Video Stitch — smooth crossfade
    {
      data: {
        audioCodec: 'aac',
        inputVideos: [],
        label: 'Crossfade Stitch',
        outputQuality: 'full',
        outputVideo: null,
        seamlessLoop: true,
        status: 'idle',
        transitionDuration: 0.8,
        transitionType: 'crossfade',
      },
      id: 'stitch',
      position: { x: 750, y: 300 },
      type: 'videoStitch',
    },

    // Stage 4: Prompt — streamer name/handle for TTS
    {
      data: {
        label: 'Handle & Schedule',
        prompt:
          "Hey, I'm @StarletStream — catch me live every Friday and Saturday night at 10 PM. Follow for exclusive content!",
        status: 'idle',
        variables: {},
      },
      id: 'handle-prompt',
      position: { x: 50, y: 700 },
      type: 'prompt',
    },

    // Stage 5: Text to Speech — intro voiceover
    {
      data: {
        inputText: null,
        jobId: null,
        label: 'Intro Voiceover',
        outputAudio: null,
        provider: 'elevenlabs',
        similarityBoost: 0.75,
        speed: 1.0,
        stability: 0.5,
        status: 'idle',
        voice: 'rachel',
      },
      id: 'tts',
      position: { x: 400, y: 700 },
      type: 'textToSpeech',
    },

    // Stage 6: Subtitle — handle/schedule overlay
    {
      data: {
        backgroundColor: 'rgba(0,0,0,0.5)',
        fontColor: '#FF69B4',
        fontFamily: 'Arial',
        fontSize: 28,
        inputText: null,
        inputVideo: null,
        jobId: null,
        label: 'Handle Overlay',
        outputVideo: null,
        position: 'bottom',
        status: 'idle',
        style: 'modern',
      },
      id: 'subtitle',
      position: { x: 1100, y: 200 },
      type: 'subtitle',
    },

    // Stage 7: Voice Change — mix voiceover onto video
    {
      data: {
        audioMixLevel: 0.8,
        inputAudio: null,
        inputVideo: null,
        jobId: null,
        label: 'Audio Mixer',
        outputVideo: null,
        preserveOriginalAudio: false,
        status: 'idle',
      },
      id: 'voice-mix',
      position: { x: 1100, y: 450 },
      type: 'voiceChange',
    },

    // Output
    {
      data: {
        inputMedia: null,
        inputType: 'video',
        label: 'Final Promo',
        outputName: 'cam-profile-promo',
        status: 'idle',
      },
      id: 'output',
      position: { x: 1450, y: 350 },
      type: 'download',
    },
  ],
  updatedAt: new Date().toISOString(),
  version: 1,
};
