import { GetOptimalTimeDto } from '@api/collections/schedules/dto/optimal-time.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('GetOptimalTimeDto', () => {
  it('accepts a platform alone', async () => {
    const dto = plainToInstance(GetOptimalTimeDto, { platform: 'twitter' });

    expect(await validate(dto)).toEqual([]);
  });

  it('accepts scope and timezone', async () => {
    const dto = plainToInstance(GetOptimalTimeDto, {
      brandId: 'brand_1',
      credentialId: 'credential_1',
      platform: 'instagram',
      timezone: 'America/New_York',
    });

    expect(await validate(dto)).toEqual([]);
  });

  it('rejects an unknown platform and a missing platform', async () => {
    const unknown = plainToInstance(GetOptimalTimeDto, { platform: 'myspace' });
    const missing = plainToInstance(GetOptimalTimeDto, {});

    expect(await validate(unknown)).toHaveLength(1);
    expect(await validate(missing)).toHaveLength(1);
  });
});
