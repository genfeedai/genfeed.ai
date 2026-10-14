import { StoryboardRunsController } from '@api/collections/content-runs/controllers/storyboard-runs.controller';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeCollection: vi.fn(),
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, doc: unknown) => ({
      serialized: doc,
    }),
  ),
}));

describe('storyboard plan draft route', () => {
  it('drafts with the authenticated organization and serializes the run', async () => {
    const draftPlan = vi.fn(async () => ({
      id: 'run-1',
      brandId: 'brand-1',
      organizationId: 'authenticated-org',
      createdAt: '2026-09-30T12:00:00.000Z',
      updatedAt: '2026-09-30T12:00:00.000Z',
      config: {},
    }));
    const controller = new StoryboardRunsController(
      { draftPlan } as never,
      {} as never,
      {} as never,
    );
    const body = { expectedRevision: 2, instruction: 'Shorter' };
    const result = await controller.draftPlan(
      { url: '/brands/brand-1/storyboard-runs/run-1/plan/draft' } as never,
      'brand-1',
      'run-1',
      { organizationId: 'authenticated-org', userId: 'user-1' } as never,
      body,
    );
    expect(result).toEqual({
      serialized: expect.objectContaining({ id: 'run-1' }),
    });
    expect(draftPlan).toHaveBeenCalledWith(
      'authenticated-org',
      'brand-1',
      'run-1',
      body,
    );
  });

  it('is a POST under plan/draft', () => {
    const handler = StoryboardRunsController.prototype.draftPlan;
    expect(Reflect.getMetadata('path', handler)).toBe(':runId/plan/draft');
    expect(Reflect.getMetadata('method', handler)).toBe(RequestMethod.POST);
  });
});
