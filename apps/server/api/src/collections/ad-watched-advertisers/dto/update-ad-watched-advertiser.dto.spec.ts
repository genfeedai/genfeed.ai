import { UpdateAdWatchedAdvertiserDto } from '@api/collections/ad-watched-advertisers/dto/update-ad-watched-advertiser.dto';
import { plainToInstance } from 'class-transformer';

describe('UpdateAdWatchedAdvertiserDto', () => {
  it('still strips a leading @ from a patched handle', () => {
    const dto = plainToInstance(UpdateAdWatchedAdvertiserDto, {
      advertiserHandle: '@nike',
    });

    expect(dto.advertiserHandle).toBe('nike');
  });
});
