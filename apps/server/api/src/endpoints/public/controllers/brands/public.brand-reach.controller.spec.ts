import { BrandReachService } from '@api/collections/brands/services/brand-reach.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { PublicBrandReachController } from '@api/endpoints/public/controllers/brands/public.brand-reach.controller';
import { testId } from '@helpers/testing/test-id.helper';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const BRAND_ID = testId('brand');

describe('PublicBrandReachController', () => {
  const findOne = vi.fn();
  let controller: PublicBrandReachController;

  beforeEach(async () => {
    findOne.mockReset();
    const module = await Test.createTestingModule({
      controllers: [PublicBrandReachController],
      providers: [
        { provide: BrandsService, useValue: { findOne } },
        {
          // Totals exist only for the one organization the brand belongs to.
          provide: BrandReachService,
          useValue: {
            findForBrand: async (_brandId: string, organizationId: string) =>
              organizationId === 'org_profile'
                ? {
                    engagements: 12,
                    followers: 6789,
                    impressions: null,
                    views: 345,
                  }
                : {
                    engagements: 0,
                    followers: null,
                    impressions: null,
                    views: 0,
                  },
          },
        },
      ],
    }).compile();
    controller = module.get(PublicBrandReachController);
  });

  it('answers the totals of a public brand', async () => {
    findOne.mockResolvedValue({ id: BRAND_ID, organizationId: 'org_profile' });

    await expect(controller.findBrandReach(BRAND_ID)).resolves.toEqual({
      data: { engagements: 12, followers: 6789, impressions: null, views: 345 },
    });
  });

  it('answers nothing for a brand that is missing or not public', async () => {
    findOne.mockResolvedValue(null);

    await expect(controller.findBrandReach(BRAND_ID)).resolves.toEqual({
      data: null,
    });
  });

  it('answers nothing for a public brand whose owner turned Public analytics off', async () => {
    findOne.mockResolvedValue({
      id: BRAND_ID,
      isPublicAnalyticsEnabled: false,
      organizationId: 'org_profile',
    });

    await expect(controller.findBrandReach(BRAND_ID)).resolves.toEqual({
      data: null,
    });
  });

  it('answers nothing for a malformed brand id', async () => {
    await expect(controller.findBrandReach('not an id')).resolves.toEqual({
      data: null,
    });
  });
});
