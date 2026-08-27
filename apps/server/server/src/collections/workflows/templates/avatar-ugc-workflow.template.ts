export const AVATAR_UGC_WORKFLOW_TEMPLATE = {
  category: 'generation',
  description:
    'Generate a talking-head avatar video with saved identity defaults or runtime photo/audio overrides',
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
      id: 'edge-avatar-output',
      source: 'ai-avatar-video',
      sourceHandle: 'video',
      target: 'workflow-output-video',
      targetHandle: 'input',
    },
  ],
  icon: 'avatar',
  id: 'avatar-ugc-heygen',
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
  name: 'Avatar UGC (HeyGen)',
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
      position: { x: 0, y: 150 },
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
      position: { x: 0, y: 300 },
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
      position: { x: 0, y: 450 },
      type: 'workflowInput',
    },
    {
      data: {
        config: {
          aspectRatio: '9:16',
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
          outputName: 'video',
        },
        label: 'Video',
      },
      id: 'workflow-output-video',
      position: { x: 620, y: 180 },
      type: 'workflowOutput',
    },
  ],
  steps: [],
} as const;
