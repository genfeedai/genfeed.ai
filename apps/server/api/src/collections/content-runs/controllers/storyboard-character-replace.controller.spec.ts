import { StoryboardRunsController } from '@api/collections/content-runs/controllers/storyboard-runs.controller';
import { ORGANIZATION_MODULE_KEY } from '@api/common/organization-modules/organization-module.decorator';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';

describe('character replacement controller', () => {
  it('uses credit-only Storyboard admission for motion-transfer submission', () => {
    const guards: unknown[] =
      Reflect.getMetadata(
        GUARDS_METADATA,
        StoryboardRunsController.prototype.replaceCharacter,
      ) ?? [];
    expect(guards).toEqual([]);
    expect(
      Reflect.getMetadata(ORGANIZATION_MODULE_KEY, StoryboardRunsController)
        ?.moduleId,
    ).toBe('storyboard');
  });

  it('uses authenticated organization for scoped read and never invokes submission', async () => {
    const getStatus = vi.fn(async () => ({ operationId: 'receipt' }));
    const replace = vi.fn();
    const list = vi.fn(async () => ({
      operations: [],
      legacyReplacements: [],
    }));
    const controller = new StoryboardRunsController(
      {} as never,
      {} as never,
      { getStatus, replace, list } as never,
    );
    expect(
      await controller.characterReplacementStatus(
        'brand',
        'run',
        'shot',
        'operation',
        { organizationId: 'authenticated-org' } as never,
      ),
    ).toEqual({ operationId: 'receipt' });
    expect(getStatus).toHaveBeenCalledWith(
      'authenticated-org',
      'brand',
      'run',
      'shot',
      'operation',
    );
    expect(
      await controller.characterReplacements('brand', 'run', 'shot', {
        organizationId: 'authenticated-org',
      } as never),
    ).toEqual({ operations: [], legacyReplacements: [] });
    expect(list).toHaveBeenCalledWith(
      'authenticated-org',
      'brand',
      'run',
      'shot',
    );
    expect(replace).not.toHaveBeenCalled();
  });
});
