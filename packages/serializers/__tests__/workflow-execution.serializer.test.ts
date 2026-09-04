import { testId } from '@genfeedai/helpers/testing/test-id.helper';
import { WorkflowExecutionSerializer } from '@serializers/server/automation/workflow-execution.serializer';
import { describe, expect, it } from 'vitest';

const WORKFLOW_ID = testId('workflow');

type SerializedDocument = {
  data: {
    attributes: Record<string, unknown>;
    id: string;
    relationships?: Record<string, { data: unknown }>;
  };
  included?: Array<{
    attributes: Record<string, unknown>;
    id: string;
    type: string;
  }>;
};

function makeExecution(): Record<string, unknown> {
  return {
    createdAt: '2026-09-03T10:00:00.000Z',
    creditsUsed: 4,
    id: 'cmexec00000000000000000001',
    isDeleted: false,
    organizationId: 'cmorg000000000000000000001',
    status: 'FAILED',
    trigger: 'agent',
    updatedAt: '2026-09-03T10:00:05.000Z',
    userId: 'cmuser00000000000000000001',
    workflowId: WORKFLOW_ID,
  };
}

describe('WorkflowExecutionSerializer', () => {
  it('emits the hydrated workflow as a relationship with its label included', () => {
    const output = WorkflowExecutionSerializer.serialize({
      ...makeExecution(),
      workflow: {
        description: 'Generates an image from an agent tool call',
        id: WORKFLOW_ID,
        label: 'Agent Tool: generate_image',
      },
    }) as SerializedDocument;

    expect(output.data.attributes.workflowId).toBe(WORKFLOW_ID);
    expect(output.data.relationships?.workflow.data).toEqual({
      id: WORKFLOW_ID,
      type: 'workflow',
    });
    expect(output.included).toEqual([
      {
        attributes: {
          description: 'Generates an image from an agent tool call',
          label: 'Agent Tool: generate_image',
        },
        id: WORKFLOW_ID,
        type: 'workflow',
      },
    ]);
  });

  it('keeps the scalar workflowId when the relation is not hydrated', () => {
    const output = WorkflowExecutionSerializer.serialize(
      makeExecution(),
    ) as SerializedDocument;

    expect(output.data.attributes.workflowId).toBe(WORKFLOW_ID);
    expect(output.included ?? []).toEqual([]);
  });
});
