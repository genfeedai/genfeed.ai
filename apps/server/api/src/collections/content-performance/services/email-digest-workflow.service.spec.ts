import {
  buildEmailDigestChildWorkflowDefinition,
  buildEmailDigestWorkflowDefinition,
  EMAIL_DIGEST_ACTION_IDS,
  EMAIL_DIGEST_CHILD_WORKFLOW_ID,
} from '@api/collections/content-performance/services/email-digest-workflow.service';
import { describe, expect, it } from 'vitest';

describe('email digest workflow definitions', () => {
  it('prepares, discovers, renders, fans out, and finalizes', () => {
    const definition = buildEmailDigestWorkflowDefinition();
    expect(
      definition.definition.nodes.map((node) => node.data.config.actionId),
    ).toEqual([
      EMAIL_DIGEST_ACTION_IDS.PREPARE,
      EMAIL_DIGEST_ACTION_IDS.DISCOVER,
      EMAIL_DIGEST_ACTION_IDS.RENDER,
      'workflow.for-each',
      EMAIL_DIGEST_ACTION_IDS.FINALIZE,
    ]);
    const fanOut = definition.definition.nodes.find(
      (node) => node.data.config.actionId === 'workflow.for-each',
    );
    expect(fanOut?.data?.config).toMatchObject({
      parameters: {
        childWorkflowId: EMAIL_DIGEST_CHILD_WORKFLOW_ID,
        itemInputKey: 'delivery',
        mode: 'await',
      },
    });
  });

  it('keeps one recipient delivery as the child atomic action', () => {
    const child = buildEmailDigestChildWorkflowDefinition();
    expect(child.definition.nodes).toHaveLength(1);
    expect(child.definition.nodes[0]?.data.config.actionId).toBe(
      EMAIL_DIGEST_ACTION_IDS.DELIVER,
    );
  });
});
