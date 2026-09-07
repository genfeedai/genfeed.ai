import { createTemplateActionNode } from '@api/collections/workflows/templates/template-action-node';
import type { WorkflowTemplate } from '@api/collections/workflows/templates/workflow-templates';

type Nodes = NonNullable<WorkflowTemplate['nodes']>;
type Edges = NonNullable<WorkflowTemplate['edges']>;
function input(
  key: string,
  label: string,
  type: string,
  y: number,
): Nodes[number] {
  return {
    id: key,
    type: 'workflowInput',
    position: { x: 0, y },
    data: {
      label,
      config: { inputName: key, inputType: type, required: true },
    },
  };
}
function action(
  id: string,
  actionId: string,
  label: string,
  config: Record<string, unknown>,
  x: number,
  y: number,
  inputVariableKeys: string[] = [],
): Nodes[number] {
  return createTemplateActionNode(actionId, {
    id,
    position: { x, y },
    data: { label, config, inputVariableKeys },
  });
}
function edge(
  source: string,
  sourceHandle: string | undefined,
  target: string,
  targetHandle: string,
): Edges[number] {
  return {
    id: `${source}-${sourceHandle}-${target}-${targetHandle}`,
    source,
    sourceHandle,
    target,
    targetHandle,
  };
}
const reviewBackground: Nodes[number] = {
  id: 'review-background',
  type: 'reviewGate',
  position: { x: 650, y: 320 },
  data: {
    label: 'Listen to separated background',
    config: {
      requireApproval: true,
      autoApproveIfNoResponse: false,
      timeoutHours: 24,
      notifyChannels: ['task-inbox'],
    },
  },
};
const output = () =>
  action(
    'output',
    'workflow.collect-output',
    'Finished video',
    { outputName: 'video' },
    1300,
    0,
  );

export const DYNAMIC_VIDEO_WORKFLOW_TEMPLATES: Record<
  string,
  WorkflowTemplate
> = {
  'localize-existing-ad': {
    id: 'localize-existing-ad',
    name: 'Localize an Existing Ad',
    category: 'generation',
    icon: 'languages',
    description:
      'Reuse a Library ad, translate timed speech, choose a voice, re-sync the mouth, review the separated background, and export. Edit segments or lock unchanged nodes before partial reruns.',
    inputVariables: [
      {
        key: 'sourceVideo',
        label: 'Original Library video',
        type: 'video',
        required: true,
      },
      { key: 'brandId', label: 'Brand', type: 'text', required: true },
      {
        key: 'targetLanguage',
        label: 'Target language code',
        type: 'text',
        required: true,
        defaultValue: 'es',
      },
      {
        key: 'voiceId',
        label: 'Speech voice ID',
        type: 'text',
        required: true,
      },
    ],
    nodes: [
      input('sourceVideo', 'Original ad', 'video', 0),
      action(
        'speech',
        'localizeSpeech',
        'Translate and fit speech',
        { timingToleranceSeconds: 0.75 },
        320,
        0,
        ['brandId', 'targetLanguage', 'voiceId'],
      ),
      action(
        'background',
        'separateDialogue',
        'Separate original dialogue',
        {},
        320,
        320,
        ['brandId'],
      ),
      action(
        'lips',
        'lipSync',
        'Re-sync original performance',
        { mode: 'video', model: 'sync/lipsync-2', syncMode: 'silence' },
        650,
        0,
        ['brandId'],
      ),
      reviewBackground,
      action(
        'mix',
        'soundOverlay',
        'Mix approved background with new speech',
        { mixMode: 'mix', audioVolume: 100, videoVolume: 100 },
        980,
        0,
        ['brandId'],
      ),
      output(),
    ],
    edges: [
      edge('sourceVideo', undefined, 'speech', 'video'),
      edge('sourceVideo', undefined, 'background', 'video'),
      edge('sourceVideo', undefined, 'lips', 'video'),
      edge('speech', 'audio', 'lips', 'audio'),
      edge('background', 'audio', 'review-background', 'media'),
      edge('review-background', 'media', 'mix', 'soundUrl'),
      edge('lips', 'videoUrl', 'mix', 'videoUrl'),
      edge('mix', 'videoUrl', 'output', 'input'),
    ],
  },
  'compose-video-scenes': {
    id: 'compose-video-scenes',
    name: 'Compose Video Scenes',
    category: 'generation',
    icon: 'film',
    description:
      'Assemble generated Library clips in order, then replace their audio with a selected speech or soundtrack asset. Reuse the clips while changing audio or scene order.',
    inputVariables: [
      {
        key: 'inputVideos',
        label: 'Ordered Library video URLs',
        type: 'json',
        required: true,
      },
      {
        key: 'soundtrack',
        label: 'Speech or soundtrack asset',
        type: 'audio',
        required: true,
      },
      { key: 'brandId', label: 'Brand', type: 'text', required: true },
    ],
    nodes: [
      input('inputVideos', 'Ordered Library scenes', 'json', 0),
      action(
        'stitch',
        'videoStitch',
        'Assemble ordered scenes',
        { transitionType: 'cut', transitionDuration: 0 },
        320,
        0,
        ['brandId'],
      ),
      input('soundtrack', 'Replacement soundtrack', 'audio', 240),
      action(
        'mix',
        'soundOverlay',
        'Replace clip soundtracks',
        { mixMode: 'replace', audioVolume: 100, videoVolume: 0 },
        650,
        0,
        ['brandId'],
      ),
      output(),
    ],
    edges: [
      edge('inputVideos', undefined, 'stitch', 'videos'),
      edge('stitch', 'videoUrl', 'mix', 'videoUrl'),
      edge('soundtrack', undefined, 'mix', 'soundUrl'),
      edge('mix', 'videoUrl', 'output', 'input'),
    ],
  },
  'generate-speaking-scenes': {
    id: 'generate-speaking-scenes',
    name: 'Generate Speaking Scenes',
    category: 'generation',
    icon: 'video',
    description:
      'Generate speech for two scripts in the selected language, animate one portrait against each voice track, then assemble the scenes. Duplicate scene nodes for more sections or languages; lock finished scenes when rerunning.',
    inputVariables: [
      {
        key: 'portrait',
        label: 'Library portrait',
        type: 'image',
        required: true,
      },
      {
        key: 'sceneScriptA',
        label: 'First scene script',
        type: 'text',
        required: true,
      },
      {
        key: 'sceneScriptB',
        label: 'Second scene script',
        type: 'text',
        required: true,
      },
      { key: 'brandId', label: 'Brand', type: 'text', required: true },
      {
        key: 'voiceId',
        label: 'Speech voice ID',
        type: 'text',
        required: true,
      },
      {
        key: 'targetLanguage',
        label: 'Speech language code',
        type: 'text',
        required: true,
      },
    ],
    nodes: [
      input('portrait', 'Shared portrait', 'image', 0),
      input('sceneScriptA', 'First scene script', 'text', 160),
      input('sceneScriptB', 'Second scene script', 'text', 320),
      input('targetLanguage', 'Speech language', 'text', 480),
      action(
        'speechA',
        'textToSpeech',
        'Generate first voice track',
        {},
        250,
        160,
        ['brandId', 'voiceId'],
      ),
      action(
        'speechB',
        'textToSpeech',
        'Generate second voice track',
        {},
        250,
        420,
        ['brandId', 'voiceId'],
      ),
      action(
        'sceneA',
        'lipSync',
        'Generate first speaking scene',
        { mode: 'image', model: 'heygen/avatar' },
        350,
        0,
        ['brandId'],
      ),
      action(
        'sceneB',
        'lipSync',
        'Generate second speaking scene',
        { mode: 'image', model: 'heygen/avatar' },
        350,
        300,
        ['brandId'],
      ),
      action(
        'stitch',
        'videoStitch',
        'Assemble speaking scenes',
        { transitionType: 'cut', transitionDuration: 0 },
        700,
        0,
        ['brandId'],
      ),
      output(),
    ],
    edges: [
      edge('portrait', undefined, 'sceneA', 'image'),
      edge('portrait', undefined, 'sceneB', 'image'),
      edge('sceneScriptA', undefined, 'speechA', 'text'),
      edge('sceneScriptB', undefined, 'speechB', 'text'),
      edge('targetLanguage', undefined, 'speechA', 'language'),
      edge('targetLanguage', undefined, 'speechB', 'language'),
      edge('speechA', undefined, 'sceneA', 'audio'),
      edge('speechB', undefined, 'sceneB', 'audio'),
      edge('sceneA', 'videoUrl', 'stitch', 'videos'),
      edge('sceneB', 'videoUrl', 'stitch', 'videos'),
      edge('stitch', 'videoUrl', 'output', 'input'),
    ],
  },
};
