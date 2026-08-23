import { UpdateXAdWatchedAdvertiserDto } from '@api/collections/x-ad-watched-advertisers/dto/update-x-ad-watched-advertiser.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('UpdateXAdWatchedAdvertiserDto', () => {
  it('validates an empty patch (every field optional)', async () => {
    const dto = plainToInstance(UpdateXAdWatchedAdvertiserDto, {});

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('validates with isDeleted set', async () => {
    const dto = plainToInstance(UpdateXAdWatchedAdvertiserDto, {
      isDeleted: true,
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects a non-boolean isDeleted', async () => {
    const dto = plainToInstance(UpdateXAdWatchedAdvertiserDto, {
      isDeleted: 'yes',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'isDeleted')).toBe(true);
  });

  it('still strips a leading @ from a patched handle', () => {
    const dto = plainToInstance(UpdateXAdWatchedAdvertiserDto, {
      advertiserHandle: '@nike',
    });

    expect(dto.advertiserHandle).toBe('nike');
  });
});
