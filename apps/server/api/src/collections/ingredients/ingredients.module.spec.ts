import { IngredientExportsController } from '@api/collections/ingredients/controllers/ingredient-exports.controller';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { IngredientExportService } from '@api/collections/ingredients/services/ingredient-export.service';
import { CleanExportAccessGuard } from '@api/helpers/guards/clean-export-access/clean-export-access.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionTier } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import type { INestApplication, Provider } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';

vi.mock('@api/helpers/utils/auth/auth.util', () => ({
  getIsSuperAdmin: () => false,
  getSubscriptionTier: () => SubscriptionTier.FREE,
}));
vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: (_request: unknown, _serializer: unknown, value: unknown) =>
    value,
}));

describe('IngredientsModule export entitlement wiring', () => {
  let app: INestApplication;
  const exportMedia = vi.fn();
  beforeEach(async () => {
    vi.stubEnv('GENFEED_CLOUD', '1');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', undefined);
    exportMedia
      .mockReset()
      .mockResolvedValue({ id: 'asset', url: '/watermarked.png' });
    const declaredProviders = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      IngredientsModule,
    ) as Provider[];
    const module = await Test.createTestingModule({
      controllers: [IngredientExportsController],
      providers: [
        ...declaredProviders.filter(
          (provider) => provider === CleanExportAccessGuard,
        ),
        { provide: IngredientExportService, useValue: { export: exportMedia } },
        { provide: LoggerService, useValue: { warn: vi.fn() } },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    expect(module.get(CleanExportAccessGuard)).toBeInstanceOf(
      CleanExportAccessGuard,
    );
    app = module.createNestApplication();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.user = {
        id: 'user',
        userId: 'user',
        organizationId: 'org',
        brandId: 'brand',
      };
      next();
    });
    await app.init();
  });
  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
  });
  it('rejects a free-tier clean export before calling the renderer', async () => {
    await request(app.getHttpServer())
      .post('/ingredients/asset/export')
      .send({ watermark: false })
      .expect(403);
    expect(exportMedia).not.toHaveBeenCalled();
  });
  it('keeps watermarked exports available to the free tier', async () => {
    await request(app.getHttpServer())
      .post('/ingredients/asset/export')
      .send({ watermark: true })
      .expect(201);
    expect(exportMedia).toHaveBeenCalledWith('asset', 'org', true);
  });
});
