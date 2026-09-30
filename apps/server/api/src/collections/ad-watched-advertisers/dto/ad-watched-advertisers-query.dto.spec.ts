import { AdWatchedAdvertisersQueryDto } from '@api/collections/ad-watched-advertisers/dto/ad-watched-advertisers-query.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('AdWatchedAdvertisersQueryDto', () => {
  it('does not expose organizationId as a client-selectable query field', async () => {
    const dto = plainToInstance(AdWatchedAdvertisersQueryDto, {
      advertiserHandle: 'nike',
      organizationId: 'other-org',
    });

    await validate(dto, { whitelist: true });

    expect(dto).toMatchObject({ advertiserHandle: 'nike' });
    expect(dto).not.toHaveProperty('organizationId');
  });

  it('accepts a supported platform filter', async () => {
    const dto = plainToInstance(AdWatchedAdvertisersQueryDto, {
      platform: 'tiktok',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects a platform filter outside the supported ad platforms', async () => {
    const dto = plainToInstance(AdWatchedAdvertisersQueryDto, {
      platform: 'linkedin',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'platform')).toBe(true);
  });
});
