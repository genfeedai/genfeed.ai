// Role authorization has its own guard suite; this unit covers export handler policy and metadata.
vi.mock('@api/helpers/guards/roles/roles.guard', () => ({
  RolesGuard: class RolesGuard {},
}));

import { IngredientExportsController } from '@api/collections/ingredients/controllers/ingredient-exports.controller';
import { IngredientExportService } from '@api/collections/ingredients/services/ingredient-export.service';
import { REQUEST_TIMEOUT_MS } from '@api/helpers/decorators/request-timeout/request-timeout.decorator';
import { RATE_LIMIT_KEY } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';

describe('IngredientExportsController', () => {
  it('limits rendering per user and allows its bounded processing time', () => {
    const handler = IngredientExportsController.prototype.export;
    expect(Reflect.getMetadata(RATE_LIMIT_KEY, handler)).toEqual({
      limit: 5,
      scope: 'user',
      windowMs: 60_000,
    });
    expect(Reflect.getMetadata(REQUEST_TIMEOUT_MS, handler)).toBe(600_000);
  });

  it('rejects missing organization before rendering', async () => {
    const exports = { export: vi.fn() };
    const module = await Test.createTestingModule({
      providers: [
        IngredientExportsController,
        { provide: IngredientExportService, useValue: exports },
      ],
    }).compile();
    const controller = module.get(IngredientExportsController);
    await expect(
      controller.export(
        {} as Request,
        {
          id: 'user-1',
          userId: 'user-1',
          brandId: 'brand-1',
          organizationId: '',
        },
        'image-1',
        { watermark: true },
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(exports.export).not.toHaveBeenCalled();
  });
});
