import { UpdateAdWatchedAdvertiserDto } from '@api/collections/ad-watched-advertisers/dto/update-ad-watched-advertiser.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('UpdateAdWatchedAdvertiserDto', () => {
  it('validates an empty patch (every field optional)', async () => {
    const dto = plainToInstance(UpdateAdWatchedAdvertiserDto, {});

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('validates with isDeleted set', async () => {
    const dto = plainToInstance(UpdateAdWatchedAdvertiserDto, {
      isDeleted: true,
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects a non-boolean isDeleted', async () => {
    const dto = plainToInstance(UpdateAdWatchedAdvertiserDto, {
      isDeleted: 'yes',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'isDeleted')).toBe(true);
  });

  it('still strips a leading @ from a patched handle', () => {
    const dto = plainToInstance(UpdateAdWatchedAdvertiserDto, {
      advertiserHandle: '@nike',
    });

    expect(dto.advertiserHandle).toBe('nike');
  });
});
