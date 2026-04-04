import type { WorkflowTemplate } from '@genfeedai/types';

export const JACKPOT_HIGHLIGHT_TEMPLATE: WorkflowTemplate = {
  createdAt: new Date().toISOString(),
  description:
    'Big win celebration clip: generate hero visual from win details, animate with zoom/pan, overlay winner amount, add excitement voiceover',
  edgeStyle: 'smoothstep',
  edges: [
    // Concept → LLM
    {
      id: 'e-concept-llm',
      source: 'concept',
      sourceHandle: 'text',
      target: 'llm-scene',
      targetHandle: 'prompt',
    },

    // LLM → Image
    {
      id: 'e-llm-img',
      source: 'llm-scene',
      sourceHandle: 'text',
      target: 'imageGen',
      targetHandle: 'prompt',
    },

    // Image → Video
    {
      id: 'e-img-vid',
      source: 'imageGen',
      sourceHandle: 'image',
      target: 'videoGen',
      targetHandle: 'image',
    },

    // LLM → Video (motion prompt)
    {
      id: 'e-llm-vid',
      source: 'llm-scene',
      sourceHandle: 'text',
      target: 'videoGen',
      targetHandle: 'prompt',
    },

    // Image → Annotation (for overlay editing)
    {
      id: 'e-img-annotation',
      source: 'imageGen',
      sourceHandle: 'image',
      target: 'annotation',
      targetHandle: 'image',
    },

    // LLM → TTS (celebration script)
    {
      id: 'e-llm-tts',
      source: 'llm-scene',
      sourceHandle: 'text',
      target: 'tts',
      targetHandle: 'text',
    },

    // Video + TTS → Voice Mix
    {
      id: 'e-vid-mix',
      source: 'videoGen',
      sourceHandle: 'video',
      target: 'voice-mix',
      targetHandle: 'video',
    },
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
  name: 'Jackpot Highlight',
  nodes: [
    // Stage 1: Win Details Input
    {
      data: {
        label: 'Win Details',
        prompt:
          '$250,000 JACKPOT on Mega Fortune slot — progressive jackpot hit, gold coins explosion, luxury lifestyle theme',
        status: 'idle',
        variables: {},
      },
      id: 'concept',
      position: { x: 50, y: 300 },
      type: 'prompt',
    },

    // Stage 2: LLM — visual scene + celebration script
    {
      data: {
        inputPrompt: null,
        jobId: null,
        label: 'Scene & Script Writer',
        maxTokens: 1024,
        outputText: null,
        status: 'idle',
        systemPrompt: `You are a casino content creator specializing in jackpot celebration videos. Generate:

1. A detailed hero image prompt for the winning moment:
   - Explosive, celebratory visual with gold/neon aesthetic
   - 16:9 cinematic format
   - Include slot machine, coins, lights, confetti

Format: [VISUAL] detailed image prompt [/VISUAL]

2. A 10-second excitement voiceover script:
   - Announce the win amount dramatically
   - Build hype and congratulations
   - End with a CTA

Format: [VOICE] voiceover script [/VOICE]`,
        temperature: 0.8,
        topP: 0.9,
      },
      id: 'llm-scene',
      position: { x: 350, y: 300 },
      type: 'llm',
    },

    // Stage 3: Image Generation — hero visual
    {
      data: {
        aspectRatio: '16:9',
        inputImages: [],
        inputPrompt: null,
        jobId: null,
        label: 'Hero Visual',
        model: 'nano-banana-pro',
        outputFormat: 'jpg',
        outputImage: null,
        resolution: '2K',
        status: 'idle',
      },
      id: 'imageGen',
      position: { x: 700, y: 200 },
      type: 'imageGen',
    },

    // Stage 4: Video Generation — zoom/pan animation
    {
      data: {
        aspectRatio: '16:9',
        duration: 8,
        generateAudio: false,
        inputImage: null,
        inputPrompt: null,
        jobId: null,
        label: 'Animated Scene',
        lastFrame: null,
        model: 'veo-3.1',
        negativePrompt: 'blurry, distorted, low quality',
        outputVideo: null,
        referenceImages: [],
        resolution: '1080p',
        status: 'idle',
      },
      id: 'videoGen',
      position: { x: 1050, y: 200 },
      type: 'videoGen',
    },

    // Stage 5: Annotation — winner amount overlay
    {
      data: {
        annotations: [],
        hasAnnotations: false,
        inputImage: null,
        label: 'Amount Overlay',
        outputImage: null,
        status: 'idle',
      },
      id: 'annotation',
      position: { x: 1050, y: 450 },
      type: 'annotation',
    },

    // Stage 6: Text to Speech — excitement voiceover
    {
      data: {
        inputText: null,
        jobId: null,
        label: 'Excitement Voiceover',
        outputAudio: null,
        provider: 'elevenlabs',
        similarityBoost: 0.9,
        speed: 1.2,
        stability: 0.4,
        status: 'idle',
        voice: 'adam',
      },
      id: 'tts',
      position: { x: 700, y: 500 },
      type: 'textToSpeech',
    },

    // Stage 7: Voice Change — mix voiceover onto video
    {
      data: {
        audioMixLevel: 0.9,
        inputAudio: null,
        inputVideo: null,
        jobId: null,
        label: 'Audio Mixer',
        outputVideo: null,
        preserveOriginalAudio: false,
        status: 'idle',
      },
      id: 'voice-mix',
      position: { x: 1400, y: 300 },
      type: 'voiceChange',
    },

    // Output
    {
      data: {
        inputMedia: null,
        inputType: 'video',
        label: 'Final Highlight',
        outputName: 'jackpot-highlight',
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
