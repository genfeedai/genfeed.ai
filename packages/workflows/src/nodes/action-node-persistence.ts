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

/**
 * Actions whose canvas node is its own React Flow node type, because it carries editor-only data
 * (a geometry editor, a preview) beside the action's inputs.
 */
const EDITOR_NODE_ACTION_IDS: ReadonlySet<string> = new Set([
  'annotation',
  'motionControl',
]);

export function hasEditorNodeType(actionId: string): boolean {
  return EDITOR_NODE_ACTION_IDS.has(actionId);
}

/**
 * Keeps only the parameters the action declares. A run validates its parameters against a closed
 * input schema, so the editor-only keys of an editor node (previews, unused modes) are never saved.
 * Other actions keep every parameter.
 */
export function pickActionInputParameters(
  actionId: string,
  parameters: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  if (!hasEditorNodeType(actionId)) {
    return { ...parameters };
  }
  const schema = getActionDefinition(actionId)?.inputSchema as
    | { properties?: Record<string, unknown> }
    | undefined;
  const declared = new Set(Object.keys(schema?.properties ?? {}));
  return Object.fromEntries(
    Object.entries(parameters).filter(([key]) => declared.has(key)),
  );
}
