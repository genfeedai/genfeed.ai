import { CampaignBrandScopeDto } from '@api/collections/campaigns/dto/campaign-brand-scope.dto';
import { CreateCampaignDto } from '@api/collections/campaigns/dto/create-campaign.dto';
import { UpdateCampaignDto } from '@api/collections/campaigns/dto/update-campaign.dto';
import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const VALID_BRAND_ID = 'cbrand0000001';

describe('Campaign DTO validation', () => {
  it('preserves the existing selected-tenant organization query alongside the brand scope', async () => {
    const dto = plainToInstance(CampaignBrandScopeDto, {
      brandId: VALID_BRAND_ID,
      organizationId: 'corganization00001',
    });
    expect(
      await validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
    expect(dto).toMatchObject({
      organizationId: 'corganization00001',
      brandId: VALID_BRAND_ID,
    });
  });

  it.each([
    { idempotencyKey: '', name: 'Launch' },
    { idempotencyKey: 'launch-1', name: '' },
  ])('rejects blank create-only identity fields', async (input) => {
    const dto = plainToInstance(CreateCampaignDto, {
      brandId: VALID_BRAND_ID,
      ...input,
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.constraints?.isNotEmpty)).toBe(true);
  });

  it.each([
    null,
    ['casset00000001', 'casset00000001'],
    Array.from({ length: 51 }, (_, i) => `casset${String(i).padStart(7, '0')}`),
  ])('rejects invalid asset membership: %j', async (assetIds) => {
    const dto = plainToInstance(CreateCampaignDto, {
      brandId: VALID_BRAND_ID,
      name: 'Launch',
      assetIds,
    });
    expect(
      (await validate(dto)).some((error) => error.property === 'assetIds'),
    ).toBe(true);
  });

  it('rejects null campaign asset membership on updates instead of passing it to Prisma', async () => {
    const dto = plainToInstance(UpdateCampaignDto, { assetIds: null });
    expect(
      (await validate(dto)).some((error) => error.property === 'assetIds'),
    ).toBe(true);
  });

  it('still clears nullable creative context and asset membership explicitly', async () => {
    const dto = plainToInstance(UpdateCampaignDto, {
      audience: null,
      tone: null,
      creativeDirection: null,
      assetIds: [],
    });
    expect(await validate(dto)).toEqual([]);
  });

  it('does not expose the create-only idempotency key on updates', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const dto = await pipe.transform(
      { idempotencyKey: 'replacement', name: 'Launch' },
      { metatype: UpdateCampaignDto, type: 'body' },
    );

    expect('idempotencyKey' in dto).toBe(false);
  });
});
