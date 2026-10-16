vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});
vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn((_request, _serializer, data) => ({ data })),
}));

import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandRelocationsController } from '@api/collections/brands/controllers/brand-relocations.controller';
import type { BrandRelocationJobsService } from '@api/collections/brands/services/brand-relocation-jobs.service';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

function setup(status = 'processing') {
  const operation = {
    id: 'move-1',
    brandId: 'brand-1',
    destinationOrganizationId: 'destination',
    status,
  };
  const jobs = { get: vi.fn().mockResolvedValue(operation) };
  const brands = {
    findOne: vi
      .fn()
      .mockResolvedValue({ id: 'brand-1', organizationId: 'destination' }),
    attachBrandKitAssetRelations: vi
      .fn()
      .mockRejectedValue(new Error('refresh unavailable')),
  };
  const logger = { warn: vi.fn() };
  const controller = new BrandRelocationsController(
    jobs as unknown as BrandRelocationJobsService,
    brands as unknown as BrandsService,
    {} as CredentialsService,
    logger as unknown as LoggerService,
  );
  const request = {} as Request;
  const user = {
    id: 'actor',
    userId: 'actor',
    organizationId: 'source',
    isSuperAdmin: false,
  } as AuthenticatedUser;
  return { controller, jobs, brands, logger, request, user };
}

describe('brand relocation status', () => {
  it('returns processing without trying to hydrate a brand still being moved', async () => {
    const { controller, brands, request, user } = setup();
    await expect(
      controller.getRelocation(request, user, 'brand-1', 'move-1'),
    ).resolves.toMatchObject({ data: { status: 'processing' } });
    expect(brands.findOne).not.toHaveBeenCalled();
  });

  it('returns durable done even when brand response hydration fails', async () => {
    const { controller, logger, request, user } = setup('done');
    await expect(
      controller.getRelocation(request, user, 'brand-1', 'move-1'),
    ).resolves.toMatchObject({ data: { status: 'done' } });
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('authorizes the receipt before reading the brand in another tenant', async () => {
    const { controller, jobs, brands, request, user } = setup('done');
    jobs.get.mockRejectedValue(new ForbiddenException());
    await expect(
      controller.getRelocation(request, user, 'brand-1', 'move-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(brands.findOne).not.toHaveBeenCalled();
  });
});
