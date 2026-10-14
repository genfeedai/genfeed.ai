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

describe('storyboard still routes', () => {
  const run = {
    id: 'run-1',
    brandId: 'brand-1',
    organizationId: 'authenticated-org',
    createdAt: '2026-10-14T12:00:00.000Z',
    updatedAt: '2026-10-14T12:00:00.000Z',
    config: {},
  };
  const user = { organizationId: 'authenticated-org', userId: 'user-1' };

  it('quotes, generates and reconciles with the authenticated organization', async () => {
    const stills = {
      quote: vi.fn(async () => ({ total: 4 })),
      generate: vi.fn(async () => run),
      reconcile: vi.fn(async () => run),
    };
    const controller = new StoryboardRunsController(
      {} as never,
      {} as never,
      {} as never,
      stills as never,
    );
    const quoteBody = { expectedRevision: 3 };
    await expect(
      controller.quoteStills('brand-1', 'run-1', user as never, quoteBody),
    ).resolves.toEqual({ total: 4 });
    expect(stills.quote).toHaveBeenCalledWith(
      'authenticated-org',
      'brand-1',
      'run-1',
      quoteBody,
    );
    const generateBody = {
      expectedRevision: 3,
      shotIds: ['shot-1'],
      inputHash: 'a'.repeat(64),
    };
    await expect(
      controller.generateStills(
        {} as never,
        'brand-1',
        'run-1',
        user as never,
        generateBody,
      ),
    ).resolves.toEqual({ serialized: run });
    expect(stills.generate).toHaveBeenCalledWith(
      'authenticated-org',
      'brand-1',
      'run-1',
      'user-1',
      generateBody,
    );
    await controller.reconcileStills(
      {} as never,
      'brand-1',
      'run-1',
      user as never,
    );
    expect(stills.reconcile).toHaveBeenCalledWith(
      'authenticated-org',
      'brand-1',
      'run-1',
    );
  });

  it('exposes POST routes under stills', () => {
    const routes = {
      quoteStills: ':runId/stills/quote',
      generateStills: ':runId/stills',
      reconcileStills: ':runId/stills/reconcile',
    } as const;
    for (const [name, path] of Object.entries(routes)) {
      const handler =
        StoryboardRunsController.prototype[name as keyof typeof routes];
      expect(Reflect.getMetadata('path', handler)).toBe(path);
      expect(Reflect.getMetadata('method', handler)).toBe(RequestMethod.POST);
    }
  });
});
