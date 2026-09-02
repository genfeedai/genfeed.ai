import { describe, expect, it } from 'vitest';
import {
  buildClipGenerationWorkflowDefinition,
  CLIP_GENERATION_CHILD_WORKFLOW_ID,
  CLIP_GENERATION_PLAN_ACTION_ID,
  CLIP_GENERATION_WORKFLOW_ID,
  CLIP_HOOK_REVIEW_NODE_ID,
} from './clip-generation-workflow-definition';

describe('buildClipGenerationWorkflowDefinition', () => {
  it('defines one immutable fan-out graph around the native review gate', () => {
    const workflow = buildClipGenerationWorkflowDefinition();

    expect(workflow.canonicalId).toBe(CLIP_GENERATION_WORKFLOW_ID);
    expect(workflow.resultNodeId).toBe('generate-remaining');
    expect(workflow.definition.nodes.map((node) => node.id)).toEqual([
      'plan-generation',
      'generate-hook',
      'hook-review-required',
      CLIP_HOOK_REVIEW_NODE_ID,
      'generate-remaining',
    ]);
    expect(workflow.definition.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            config: expect.objectContaining({
              actionId: CLIP_GENERATION_PLAN_ACTION_ID,
            }),
            inputVariableKeys: ['request', 'reviewContext'],
          }),
          id: 'plan-generation',
          type: 'genfeedAction',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            config: expect.objectContaining({
              actionId: 'workflow.for-each',
              parameters: expect.objectContaining({
                childWorkflowId: CLIP_GENERATION_CHILD_WORKFLOW_ID,
                mode: 'await',
              }),
            }),
          }),
          id: 'generate-remaining',
          type: 'genfeedAction',
        }),
        expect.objectContaining({
          id: CLIP_HOOK_REVIEW_NODE_ID,
          type: 'reviewGate',
        }),
      ]),
    );
    expect(workflow.definition.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'hook-review-required',
          sourceHandle: 'true',
          target: CLIP_HOOK_REVIEW_NODE_ID,
        }),
        expect.objectContaining({
          source: 'hook-review-required',
          sourceHandle: 'false',
          target: 'generate-remaining',
        }),
        expect.objectContaining({
          source: CLIP_HOOK_REVIEW_NODE_ID,
          target: 'generate-remaining',
        }),
      ]),
    );
  });

  it('keeps all request data in immutable execution inputs', () => {
    const workflow = buildClipGenerationWorkflowDefinition();

    expect(workflow.definition.inputVariables).toEqual([
      {
        key: 'request',
        label: 'Clip generation request',
        required: true,
        type: 'json',
      },
      {
        key: 'reviewContext',
        label: 'Hook review context',
        required: false,
        type: 'json',
      },
    ]);
    expect(JSON.stringify(workflow.definition.nodes)).not.toContain(
      'projectId',
    );
  });
});
