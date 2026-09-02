import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-runner.service';
import { createGenfeedActionNode } from '@genfeedai/actions';

export const CLIP_ANALYSIS_WORKFLOW_ID = 'clip.analysis';
export const CLIP_ANALYSIS_FAILURE_WORKFLOW_ID = 'clip.analysis.failure';

export const CLIP_ANALYSIS_ACTION_IDS = {
  DETECT_HIGHLIGHTS: 'clip.analysis.detect-highlights',
  FAIL: 'clip.analysis.fail',
  PERSIST: 'clip.analysis.persist',
  PREPARE_SOURCE: 'clip.analysis.prepare-source',
  REFERENCE_FRAMES: 'clip.analysis.extract-reference-frames',
  TRANSCRIBE: 'clip.analysis.transcribe',
} as const;

export function buildClipAnalysisWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: CLIP_ANALYSIS_WORKFLOW_ID,
    definition: {
      edges: [
        {
          id: 'prepare-to-transcribe',
          source: 'prepare-source',
          target: 'transcribe',
          targetHandle: 'prepared',
        },
        {
          id: 'transcribe-to-highlights',
          source: 'transcribe',
          target: 'detect-highlights',
          targetHandle: 'transcribed',
        },
        {
          id: 'highlights-to-frames',
          source: 'detect-highlights',
          target: 'reference-frames',
          targetHandle: 'highlighted',
        },
        {
          id: 'frames-to-persist',
          source: 'reference-frames',
          target: 'persist-analysis',
          targetHandle: 'referenced',
        },
      ],
      inputVariables: [
        {
          key: 'job',
          label: 'Clip analysis request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: CLIP_ANALYSIS_ACTION_IDS.PREPARE_SOURCE,
          id: 'prepare-source',
          inputVariableKeys: ['job'],
          position: { x: 0, y: 0 },
        }),
        createGenfeedActionNode({
          actionId: CLIP_ANALYSIS_ACTION_IDS.TRANSCRIBE,
          id: 'transcribe',
          position: { x: 0, y: 160 },
        }),
        createGenfeedActionNode({
          actionId: CLIP_ANALYSIS_ACTION_IDS.DETECT_HIGHLIGHTS,
          id: 'detect-highlights',
          position: { x: 0, y: 320 },
        }),
        createGenfeedActionNode({
          actionId: CLIP_ANALYSIS_ACTION_IDS.REFERENCE_FRAMES,
          id: 'reference-frames',
          position: { x: 0, y: 480 },
        }),
        createGenfeedActionNode({
          actionId: CLIP_ANALYSIS_ACTION_IDS.PERSIST,
          id: 'persist-analysis',
          position: { x: 0, y: 640 },
        }),
      ],
    },
    description:
      'Prepares, transcribes, analyzes, enriches, and persists one clip source.',
    label: 'Clip Analysis',
    resultNodeId: 'persist-analysis',
    version: 1,
  };
}

export function buildClipAnalysisFailureWorkflowDefinition(): SystemWorkflowGraphDefinition {
  return {
    canonicalId: CLIP_ANALYSIS_FAILURE_WORKFLOW_ID,
    definition: {
      edges: [],
      inputVariables: [
        {
          key: 'job',
          label: 'Failed clip analysis request',
          required: true,
          type: 'json',
        },
      ],
      nodes: [
        createGenfeedActionNode({
          actionId: CLIP_ANALYSIS_ACTION_IDS.FAIL,
          id: 'fail-analysis',
          inputVariableKeys: ['job'],
          position: { x: 0, y: 0 },
        }),
      ],
    },
    description: 'Projects terminal failure for one clip analysis.',
    label: 'Fail Clip Analysis',
    resultNodeId: 'fail-analysis',
    version: 1,
  };
}
