import { getActionDefinition } from '@genfeedai/actions';

const PRESENTATION_NODE_TYPE_TO_ACTION_ID = {
  'ai-avatar-video': 'aiAvatarVideo',
  'ai-generate-image': 'imageGen',
  'ai-generate-newsletter': 'newsletterGen',
  'ai-generate-post': 'postGen',
  'ai-generate-video': 'videoGen',
  'ai-lip-sync': 'lipSync',
  'ai-llm': 'llm',
  'ai-prompt-constructor': 'promptConstructor',
  'ai-reframe': 'reframe',
  'ai-text-to-speech': 'textToSpeech',
  'ai-upscale': 'upscale',
  'ai-voice-change': 'voiceChange',
  'attach-post-ingredient': 'attachPostIngredient',
  captionGen: 'effect-captions',
  'cast-prompt-generator': 'castPrompt',
  download: 'workflow.collect-output',
  'effect-color-grade': 'colorGrade',
  generateVideo: 'videoGen',
  'output-publish': 'publish',
  outputGallery: 'workflow.collect-output',
  'source-corpus': 'sourceCorpus',
  workflowOutput: 'workflow.collect-output',
} as const satisfies Readonly<Record<string, string>>;

const ACTION_ID_TO_PRESENTATION_NODE_TYPE = {
  aiAvatarVideo: 'ai-avatar-video',
  'effect-captions': 'captionGen',
  'workflow.collect-output': 'workflowOutput',
} as const satisfies Readonly<Record<string, string>>;

export function getWorkflowActionIdForNodeType(
  nodeType: string,
): string | undefined {
  const mappedActionId = (
    PRESENTATION_NODE_TYPE_TO_ACTION_ID as Readonly<Record<string, string>>
  )[nodeType];
  const actionId = mappedActionId ?? nodeType;

  return getActionDefinition(actionId)?.id;
}

export function getWorkflowPresentationNodeType(actionId: string): string {
  return (
    (ACTION_ID_TO_PRESENTATION_NODE_TYPE as Readonly<Record<string, string>>)[
      actionId
    ] ?? actionId
  );
}
