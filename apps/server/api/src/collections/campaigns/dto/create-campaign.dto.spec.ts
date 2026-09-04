import { CreateCampaignDto } from '@api/collections/campaigns/dto/create-campaign.dto';
import { UpdateCampaignDto } from '@api/collections/campaigns/dto/update-campaign.dto';
import { ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const VALID_BRAND_ID = 'cbrand0000001';

describe('Campaign DTO validation', () => {
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

  it('does not expose the create-only idempotency key on updates', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    const dto = await pipe.transform(
      { idempotencyKey: 'replacement', name: 'Launch' },
      { metatype: UpdateCampaignDto, type: 'body' },
    );

    expect('idempotencyKey' in dto).toBe(false);
  });
});
