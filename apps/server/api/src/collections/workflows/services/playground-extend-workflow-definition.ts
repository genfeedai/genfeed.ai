import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const PLAYGROUND_NATIVE_EXTEND_WORKFLOW_ID = 'playground.video.extend.native';
export const PLAYGROUND_FABRICATED_EXTEND_WORKFLOW_ID = 'playground.video.extend.fabricated';

/** Server-owned graph; source identity and chosen model are frozen by execution admission. */
export function buildPlaygroundNativeExtendWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const keys = ['brandId', 'model', 'prompt', 'duration', 'videoReference', 'parentIngredientId', 'sourceEvidence', 'task', 'resolution', 'generate_audio'];
  return {
    canonicalId: PLAYGROUND_NATIVE_EXTEND_WORKFLOW_ID,
    description: 'Extend one authorized completed video using a reviewed native provider route.',
    label: 'Extend Video',
    organizationModule: 'playground',
    generationAdmission: true,
    resultNodeId: 'extension-video',
    version: 1,
    definition: {
      edges: [],
      inputVariables: keys.map((key) => ({ key, label: key, required: ['brandId', 'model', 'prompt', 'duration', 'videoReference', 'parentIngredientId', 'sourceEvidence', 'task'].includes(key), type: key === 'sourceEvidence' ? 'json' : key === 'duration' ? 'number' : 'text' })),
      nodes: [createGenfeedActionNode({ actionId: 'videoGen', id: 'extension-video', inputVariableKeys: keys, parameters: { actionVerb: 'extend' }, position: { x: 0, y: 0 } })],
    },
  };
}

/** The last frame is already a persisted authorized asset before execution admission. */
export function buildPlaygroundFabricatedExtendWorkflowDefinition(): SystemWorkflowGraphDefinition {
  const keys = ['brandId', 'model', 'prompt', 'duration', 'image', 'parentIngredientId', 'sourceEvidence', 'frameIngredientId'];
  return {
    canonicalId: PLAYGROUND_FABRICATED_EXTEND_WORKFLOW_ID,
    description: 'Generate a continuation from a stored last-frame asset and concatenate it with the authorized source.',
    label: 'Extend Video', organizationModule: 'playground', generationAdmission: true, resultNodeId: 'extended-video', version: 1,
    definition: {
      inputVariables: [...keys, 'sourceVideo', 'parentId'].map((key) => ({ key, label: key, required: true, type: key === 'sourceEvidence' || key === 'sourceVideo' ? 'json' : key === 'duration' ? 'number' : 'text' })),
      nodes: [
        { id: 'source-video', type: 'workflowInput', position: { x: 0, y: 0 }, data: { label: 'Source Video', config: { inputName: 'sourceVideo', required: true } } },
        createGenfeedActionNode({ actionId: 'videoGen', id: 'extension-video', inputVariableKeys: keys, parameters: { actionVerb: 'extend' }, position: { x: 280, y: 0 } }),
        createGenfeedActionNode({ actionId: 'videoStitch', id: 'extended-video', inputVariableKeys: ['brandId', 'model', 'parentId'], parameters: { dispatchMode: 'fabricated', audioCodec: 'aac', outputQuality: 'full', seamlessLoop: false, transitionDuration: 0, transitionType: 'cut' }, position: { x: 560, y: 0 } }),
      ],
      edges: [
        { id: 'source-to-stitch', source: 'source-video', sourceHandle: 'video', target: 'extended-video', targetHandle: 'videos' },
        { id: 'extension-to-stitch', source: 'extension-video', sourceHandle: 'videoUrl', target: 'extended-video', targetHandle: 'videos' },
      ],
    },
  };
}
