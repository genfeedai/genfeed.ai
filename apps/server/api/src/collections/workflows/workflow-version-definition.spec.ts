import {
  buildWorkflowVersionDefinition,
  createVersionedWorkflow,
} from '@api/collections/workflows/workflow-version-definition';
import { createGenfeedActionNode } from '@genfeedai/actions';
import { describe, expect, it, vi } from 'vitest';

describe('buildWorkflowVersionDefinition', () => {
  it('persists explicit action nodes and workflow inputs as one graph', () => {
    const definition = buildWorkflowVersionDefinition({
      nodes: [
        {
          data: {
            config: {
              inputName: 'youtubeUrl',
              inputType: 'text',
              required: true,
            },
            label: 'YouTube URL',
          },
          id: 'youtube-url',
          position: { x: 0, y: 0 },
          type: 'workflowInput',
        },
        createGenfeedActionNode({
          actionId: 'youtube.resolve-source',
          id: 'resolve-source',
        }),
      ],
    });

    expect(definition.graph.nodes.map((node) => node.type)).toEqual([
      'workflowInput',
      'genfeedAction',
    ]);
  });

  it('rejects product node types that bypass the action catalog', () => {
    expect(() =>
      buildWorkflowVersionDefinition({
        nodes: [
          {
            data: { config: {}, label: 'Legacy generation' },
            id: 'legacy-image',
            position: { x: 0, y: 0 },
            type: 'imageGen',
          },
        ],
      }),
    ).toThrow('use a registered Genfeed action node');
  });

  it('rejects action nodes whose action ID is not registered', () => {
    expect(() =>
      buildWorkflowVersionDefinition({
        nodes: [
          {
            data: {
              config: { actionId: 'missing.action', parameters: {} },
              label: 'Missing action',
            },
            id: 'missing-action',
            position: { x: 0, y: 0 },
            type: 'genfeedAction',
          },
        ],
      }),
    ).toThrow('references unknown Genfeed action missing.action');
  });

  it('rejects cycles before persisting an immutable graph version', () => {
    expect(() =>
      buildWorkflowVersionDefinition({
        edges: [
          { id: 'a-b', source: 'a', target: 'b' },
          { id: 'b-a', source: 'b', target: 'a' },
        ],
        nodes: [
          {
            data: { config: {}, label: 'A' },
            id: 'a',
            position: { x: 0, y: 0 },
            type: 'condition',
          },
          {
            data: { config: {}, label: 'B' },
            id: 'b',
            position: { x: 100, y: 0 },
            type: 'condition',
          },
        ],
      }),
    ).toThrow('Workflow contains a cycle');
  });

  it('rejects edges and locked IDs that reference missing nodes', () => {
    expect(() =>
      buildWorkflowVersionDefinition({
        edges: [{ id: 'missing-edge', source: 'condition', target: 'missing' }],
        lockedNodeIds: ['also-missing'],
        nodes: [
          {
            data: { config: {}, label: 'Condition' },
            id: 'condition',
            position: { x: 0, y: 0 },
            type: 'condition',
          },
        ],
      }),
    ).toThrow('references non-existent target node');
  });
});

describe('createVersionedWorkflow', () => {
  it('creates the workflow already pinned to its preallocated immutable version', async () => {
    const workflowCreate = vi.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'workflow-1',
        organizationId: data.organizationId,
        userId: data.userId,
      }),
    );
    const versionCreate = vi.fn().mockResolvedValue({ id: 'version-1' });
    const findUniqueOrThrow = vi.fn().mockResolvedValue({
      currentVersion: { id: 'version-1', version: 1 },
      id: 'workflow-1',
    });
    const transaction = {
      workflow: { create: workflowCreate, findUniqueOrThrow },
      workflowVersion: { create: versionCreate },
    };

    await createVersionedWorkflow(
      transaction as never,
      {
        organizationId: 'organization-1',
        userId: 'user-1',
      },
      {},
    );

    const currentVersionId = workflowCreate.mock.calls[0]?.[0].data
      .currentVersionId as string;
    expect(currentVersionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(versionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: currentVersionId,
        organizationId: 'organization-1',
        userId: 'user-1',
        version: 1,
        workflowId: 'workflow-1',
      }),
    });
    expect(findUniqueOrThrow).toHaveBeenCalledWith({
      include: { currentVersion: true },
      where: { id: 'workflow-1' },
    });
  });
});
