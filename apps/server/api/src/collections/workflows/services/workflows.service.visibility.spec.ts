import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { describe, expect, it, vi } from 'vitest';

const scope = { organizationId: 'org-1', userId: 'user-1' };
const visibility = {
  isDeleted: false,
  organizationId: 'org-1',
  OR: [
    { userId: 'user-1' },
    {
      metadata: {
        equals: 'organization',
        path: ['systemWorkflow', 'visibility'],
      },
    },
  ],
};

function setup() {
  const service = Object.create(WorkflowsService.prototype) as WorkflowsService;
  const find = vi.fn().mockResolvedValue([{ id: 'visible-system' }]);
  const findOne = vi.fn().mockResolvedValue({ id: 'visible-system' });
  Object.assign(service, { find, findOne });
  return { service, find, findOne };
}

describe('Workflow visible reads', () => {
  it('uses the single-read visibility policy for one bounded batch query', async () => {
    const { service, find, findOne } = setup();
    await service.findVisibleOrThrow('visible-system', scope);
    await expect(
      service.findVisibleByIds(['owned', 'visible-system', 'missing'], scope),
    ).resolves.toEqual([{ id: 'visible-system' }]);
    expect(findOne).toHaveBeenCalledWith({
      ...visibility,
      id: 'visible-system',
    });
    expect(find).toHaveBeenCalledExactlyOnceWith({
      ...visibility,
      id: { in: ['owned', 'visible-system', 'missing'] },
    });
  });

  it('adds the authorized brand restriction without widening ownership', async () => {
    const { service, find } = setup();
    await service.findVisibleByIds(['owned'], { ...scope, brandId: 'brand-1' });
    expect(find).toHaveBeenCalledWith({
      ...visibility,
      brandId: 'brand-1',
      id: { in: ['owned'] },
    });
  });

  it('returns an empty collection without reading when no ids are supplied', async () => {
    const { service, find } = setup();
    await expect(service.findVisibleByIds([], scope)).resolves.toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });

  it('rejects an oversized internal batch before reading', async () => {
    const { service, find } = setup();
    await expect(
      service.findVisibleByIds(
        Array.from({ length: 51 }, (_, index) => `workflow-${index}`),
        scope,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(find).not.toHaveBeenCalled();
  });
});
