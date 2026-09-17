import { AgentGenerationScopeService } from '@api/services/agent-orchestrator/tools/agent-generation-scope.service';
import { describe, expect, it, vi } from 'vitest';

function createService() {
  const brandsService = {
    findAll: vi.fn(),
    findOne: vi.fn(),
  };
  const knowledgeRecords = {
    getSource: vi.fn(),
  };
  return {
    brandsService,
    knowledgeRecords,
    service: new AgentGenerationScopeService(
      brandsService as never,
      knowledgeRecords as never,
    ),
  };
}

const ctx = {
  organizationId: 'org-1',
  userId: 'user-1',
};

describe('AgentGenerationScopeService', () => {
  it('does not silently pick the first of two brands', async () => {
    const { brandsService, service } = createService();
    brandsService.findOne.mockResolvedValue(null);
    brandsService.findAll.mockResolvedValue({
      docs: [
        { id: 'brand-1', label: 'First' },
        { id: 'brand-2', label: 'Second' },
      ],
    });

    const result = await service.resolveBrand({}, ctx);

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.error).toMatch(/Select a brand/);
      expect(result.error.data?.brands).toHaveLength(2);
    }
  });

  it('uses an explicit brand from the same organization', async () => {
    const { brandsService, service } = createService();
    brandsService.findOne.mockResolvedValue({ id: 'brand-2', label: 'Second' });

    const result = await service.resolveBrand({ brandId: 'brand-2' }, ctx);

    expect(result).toEqual({ brandId: 'brand-2' });
    expect(brandsService.findOne).toHaveBeenCalledWith({
      id: 'brand-2',
      isDeleted: false,
      organizationId: 'org-1',
    });
  });

  it('rejects another tenant knowledge source before generation', async () => {
    const { knowledgeRecords, service } = createService();
    knowledgeRecords.getSource.mockRejectedValue(new Error('not found'));

    const result = await service.applySelectedContext({
      ctx: { ...ctx, brandId: 'brand-2' },
      params: { selectedContext: { sourceIds: ['src-other'] } },
      prompt: 'Make a poster',
    });

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.error).toMatch(/not available/);
    }
  });
});
