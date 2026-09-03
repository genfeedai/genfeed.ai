import { ContentProductionWorkflowService } from '@api/collections/workflows/services/content-production-workflow.service';
import { PersonaContentFormat } from '@genfeedai/contracts';
import { describe, expect, it, vi } from 'vitest';

describe('ContentProductionWorkflowService atomic actions', () => {
  function buildService() {
    const contentExecution = {
      executeMediaqueryItem: vi.fn().mockResolvedValue({ status: 'COMPLETED' }),
      finalizePlanExecution: vi.fn().mockResolvedValue({
        results: [],
        summary: { completed: 0, failed: 0, total: 0 },
      }),
      persistSkillItem: vi.fn().mockResolvedValue({ isSkill: true }),
      preparePlanExecution: vi.fn().mockResolvedValue({
        baseInput: {},
        items: [],
        planId: 'plan-1',
      }),
      preparePlanItem: vi.fn().mockResolvedValue({ isSkill: true }),
      runSkillItem: vi.fn().mockResolvedValue({ isSkill: true }),
    };
    return {
      contentExecution,
      service: new ContentProductionWorkflowService(
        {} as never,
        {} as never,
        contentExecution as never,
        {} as never,
        {} as never,
        {} as never,
      ),
    };
  }

  it.each([
    [PersonaContentFormat.PHOTO, 'imageItems'],
    [PersonaContentFormat.AUDIO, 'musicItems'],
    [PersonaContentFormat.VIDEO, 'videoItems'],
  ])(
    'routes %s through one typed child-workflow collection',
    async (format, key) => {
      const { service } = buildService();
      const result = await service.prepareContentPipelinePersona({
        item: {
          brandId: 'brand-1',
          config: {
            contentStrategy: { formats: [format], topics: ['shipping'] },
            profileImageUrl: 'https://cdn.example.com/persona.png',
          },
          credentials: [{ id: 'credential-1' }],
          id: 'persona-1',
          label: 'Founder',
          organizationId: 'org-1',
          userId: 'user-1',
        },
        now: '2026-08-28T00:00:00.000Z',
      });

      expect(result[key]).toHaveLength(1);
      expect(
        ['imageItems', 'musicItems', 'videoItems']
          .filter((candidate) => candidate !== key)
          .every(
            (candidate) =>
              Array.isArray(result[candidate]) &&
              (result[candidate] as unknown[]).length === 0,
          ),
      ).toBe(true);
    },
  );

  it('adapts a planned brand into the plan execution atomic boundary', async () => {
    const { contentExecution, service } = buildService();
    await service.prepareContentEnginePlanExecution('org-1', {
      request: { brandId: 'brand-1', planId: 'plan-1', userId: 'user-1' },
    });

    expect(contentExecution.preparePlanExecution).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      'plan-1',
      'user-1',
    );
  });
});
