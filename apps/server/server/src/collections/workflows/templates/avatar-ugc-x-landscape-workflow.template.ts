import { MusicSourceType } from '@genfeedai/enums';

export const AVATAR_UGC_X_LANDSCAPE_WORKFLOW_TEMPLATE = {
  category: 'generation',
  description:
    'Generate a landscape talking-head avatar video for X with burned captions and background music',
  edges: [
    {
      id: 'edge-script-avatar',
      source: 'workflow-input-script',
      sourceHandle: 'value',
      target: 'ai-avatar-video',
      targetHandle: 'script',
    },
    {
      id: 'edge-photo-avatar',
      source: 'workflow-input-photo-url',
      sourceHandle: 'value',
      target: 'ai-avatar-video',
      targetHandle: 'photoUrl',
    },
    {
      id: 'edge-cloned-voice-avatar',
      source: 'workflow-input-cloned-voice-id',
      sourceHandle: 'value',
      target: 'ai-avatar-video',
      targetHandle: 'clonedVoiceId',
    },
    {
      id: 'edge-audio-avatar',
      source: 'workflow-input-audio-url',
      sourceHandle: 'value',
      target: 'ai-avatar-video',
      targetHandle: 'audioUrl',
    },
    {
      id: 'edge-avatar-captions',
      source: 'ai-avatar-video',
      sourceHandle: 'video',
      target: 'effect-captions',
      targetHandle: 'video',
    },
    {
      id: 'edge-captioned-overlay',
      source: 'effect-captions',
      sourceHandle: 'video',
      target: 'sound-overlay',
      targetHandle: 'videoUrl',
    },
    {
      id: 'edge-music-overlay',
      source: 'music-source',
      sourceHandle: 'musicUrl',
      target: 'sound-overlay',
      targetHandle: 'soundUrl',
    },
    {
      id: 'edge-overlay-output',
      source: 'sound-overlay',
      sourceHandle: 'videoUrl',
      target: 'workflow-output-video',
      targetHandle: 'input',
    },
  ],
  icon: 'avatar',
  id: 'avatar-ugc-x-landscape-heygen',
  inputVariables: [
    {
      key: 'script',
      label: 'Script',
      required: true,
      type: 'text',
    },
    {
      key: 'photoUrl',
      label: 'Photo URL',
      required: false,
      type: 'image',
    },
    {
      key: 'clonedVoiceId',
      label: 'Cloned Voice ID',
      required: false,
      type: 'text',
    },
    {
      key: 'audioUrl',
      label: 'Audio URL',
      required: false,
      type: 'audio',
    },
  ],
  name: 'Avatar UGC for X (HeyGen)',
  nodes: [
    {
      data: {
        config: {
          inputName: 'script',
          inputType: 'text',
          required: true,
        },
        label: 'Script',
      },
      id: 'workflow-input-script',
      position: { x: 0, y: 0 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'photoUrl',
          inputType: 'image',
          required: false,
        },
        label: 'Photo URL',
      },
      id: 'workflow-input-photo-url',
      position: { x: 0, y: 140 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'clonedVoiceId',
          inputType: 'text',
          required: false,
        },
        label: 'Cloned Voice ID',
      },
      id: 'workflow-input-cloned-voice-id',
      position: { x: 0, y: 280 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          inputName: 'audioUrl',
          inputType: 'audio',
          required: false,
        },
        label: 'Audio URL',
      },
      id: 'workflow-input-audio-url',
      position: { x: 0, y: 420 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          aspectRatio: '16:9',
          provider: 'heygen',
          useIdentityDefaults: true,
        },
        label: 'Avatar UGC Video',
      },
      id: 'ai-avatar-video',
      position: { x: 320, y: 180 },
      type: 'ai-avatar-video',
    },
    {
      data: {
        config: {
          fontColor: '#FFFFFF',
          fontSize: 'large',
          position: 'bottom',
          style: 'dynamic',
        },
        label: 'Add Captions',
      },
      id: 'effect-captions',
      position: { x: 620, y: 180 },
      type: 'effect-captions',
    },
    {
      data: {
        config: {
          libraryCategory: 'cinematic',
          libraryMood: 'uplifting',
          sourceType: MusicSourceType.LIBRARY,
        },
        label: 'Music Source',
      },
      id: 'music-source',
      position: { x: 620, y: 360 },
      type: 'musicSource',
    },
    {
      data: {
        config: {
          audioVolume: 30,
          fadeIn: 0,
          fadeOut: 0,
          mixMode: 'background',
          videoVolume: 100,
        },
        label: 'Sound Overlay',
      },
      id: 'sound-overlay',
      position: { x: 940, y: 220 },
      type: 'soundOverlay',
    },
    {
      data: {
        config: {
          outputName: 'video',
        },
        label: 'Video',
      },
      id: 'workflow-output-video',
      position: { x: 1240, y: 220 },
      type: 'workflowOutput',
    },
  ],
  steps: [],
} as const;
