import { describe, expect, it } from 'vitest';
import type { ClipGenerationInput } from './clip-generation.service';
import {
  buildClipGenerationWorkflowDefinition,
  CLIP_HOOK_REVIEW_NODE_ID,
} from './clip-generation-workflow-definition';

const request: ClipGenerationInput = {
  highlights: [
    {
      clip_type: 'body',
      end_time: 40,
      start_time: 20,
      summary: 'Body',
      tags: [],
      title: 'Body',
      virality_score: 70,
    },
    {
      clip_type: 'hook',
      end_time: 20,
      start_time: 0,
      summary: 'Hook',
      tags: [],
      title: 'Hook',
      virality_score: 90,
    },
  ],
  hookApprovalRequired: true,
  orgId: 'org-1',
  projectId: 'project-1',
  userId: 'user-1',
};

describe('buildClipGenerationWorkflowDefinition', () => {
  it('compiles one action per highlight around the native review gate', () => {
    const workflow = buildClipGenerationWorkflowDefinition(request);

    expect(workflow.definition.nodes.map((node) => node.id)).toEqual([
      'generate-clip-2',
      CLIP_HOOK_REVIEW_NODE_ID,
      'generate-clip-1',
      'collect-clip-results',
    ]);
    expect(workflow.definition.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            config: expect.objectContaining({
              actionId: 'clip.generation.generate-one',
              parameters: { originalIndex: 1 },
            }),
            inputVariableKeys: ['request'],
          }),
          id: 'generate-clip-2',
          type: 'genfeedAction',
        }),
        expect.objectContaining({
          id: CLIP_HOOK_REVIEW_NODE_ID,
          type: 'reviewGate',
        }),
        expect.objectContaining({
          data: expect.objectContaining({
            config: expect.objectContaining({
              actionId: 'clip.generation.collect-results',
            }),
          }),
          id: 'collect-clip-results',
          type: 'genfeedAction',
        }),
      ]),
    );
    expect(workflow.definition.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'generate-clip-2',
          target: CLIP_HOOK_REVIEW_NODE_ID,
        }),
        expect.objectContaining({
          source: CLIP_HOOK_REVIEW_NODE_ID,
          target: 'generate-clip-1',
        }),
      ]),
    );
  });

  it('keeps request data in execution inputs instead of duplicating it in nodes', () => {
    const workflow = buildClipGenerationWorkflowDefinition(request);
    const serializedNodes = JSON.stringify(workflow.definition.nodes);

    expect(workflow.definition.inputVariables).toEqual([
      {
        key: 'request',
        label: 'Clip generation request',
        required: true,
        type: 'json',
      },
    ]);
    expect(serializedNodes).not.toContain('Hook summary');
    expect(serializedNodes).not.toContain('org-1');
  });
});
