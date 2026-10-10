import { TurboProjectSerializer } from '@serializers/server/content/turbo-project.serializer';
import { describe, expect, it } from 'vitest';

describe('TurboProjectSerializer', () => {
  type SerializedResource = {
    data: { id: string; type: string; attributes: Record<string, unknown> };
  };

  it('exposes the persisted project state with its items', () => {
    const items = [
      {
        id: 'item-1',
        position: 0,
        projectId: 'project-1',
        status: 'READY',
      },
    ];
    const output = TurboProjectSerializer.serialize({
      brandId: 'brand-1',
      id: 'project-1',
      itemCounts: { ready: 1, total: 1 },
      items,
      kind: 'WORKFLOW',
      name: 'Product shots',
      settings: {},
      status: 'REVIEWING',
      step: 'review',
      workflowId: 'workflow-1',
    }) as SerializedResource;

    expect(output.data.type).toBe('turbo-project');
    expect(output.data.attributes).toMatchObject({
      brandId: 'brand-1',
      itemCounts: { ready: 1, total: 1 },
      items,
      kind: 'WORKFLOW',
      status: 'REVIEWING',
      step: 'review',
      workflowId: 'workflow-1',
    });
  });
});
