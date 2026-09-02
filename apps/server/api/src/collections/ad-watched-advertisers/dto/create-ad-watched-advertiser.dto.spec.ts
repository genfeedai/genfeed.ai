import { CreateAdWatchedAdvertiserDto } from '@api/collections/ad-watched-advertisers/dto/create-ad-watched-advertiser.dto';
import { testId } from '@helpers/testing/test-id.helper';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('CreateAdWatchedAdvertiserDto', () => {
  it('validates with only the required platform and handle', async () => {
    const dto = plainToInstance(CreateAdWatchedAdvertiserDto, {
      advertiserHandle: 'nike',
      platform: 'meta',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('canonicalizes whitespace, one leading @, and case', () => {
    const dto = plainToInstance(CreateAdWatchedAdvertiserDto, {
      advertiserHandle: '  @Nike  ',
      platform: '  META ',
    });

    expect(dto.advertiserHandle).toBe('nike');
    expect(dto.platform).toBe('meta');
  });

  it('leaves a handle without an @ prefix untouched', () => {
    const dto = plainToInstance(CreateAdWatchedAdvertiserDto, {
      advertiserHandle: 'nike',
      platform: 'x',
    });

    expect(dto.advertiserHandle).toBe('nike');
  });

  it('requires advertiserHandle', async () => {
    const dto = plainToInstance(CreateAdWatchedAdvertiserDto, {
      platform: 'meta',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'advertiserHandle')).toBe(
      true,
    );
  });

  it('requires platform so an omitted value can never silently land on one platform', async () => {
    const dto = plainToInstance(CreateAdWatchedAdvertiserDto, {
      advertiserHandle: 'nike',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'platform')).toBe(true);
  });

  it.each(['linkedin', 'facebook', 'snapchat', ''])(
    'rejects unsupported ad platform %s',
    async (platform) => {
      const dto = plainToInstance(CreateAdWatchedAdvertiserDto, {
        advertiserHandle: 'nike',
        platform,
      });

      const errors = await validate(dto);
      expect(errors.some((error) => error.property === 'platform')).toBe(true);
    },
  );

  it.each(['google', 'meta', 'tiktok', 'x', 'youtube'])(
    'accepts supported ad platform %s',
    async (platform) => {
      const dto = plainToInstance(CreateAdWatchedAdvertiserDto, {
        advertiserHandle: 'nike',
        platform,
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    },
  );

  it.each(['two@@signs', 'has space', 'a'.repeat(65)])(
    'rejects handle %s that the database CHECK constraint would reject',
    async (advertiserHandle) => {
      const dto = plainToInstance(CreateAdWatchedAdvertiserDto, {
        advertiserHandle,
        platform: 'meta',
      });

      const errors = await validate(dto);
      expect(
        errors.some((error) => error.property === 'advertiserHandle'),
      ).toBe(true);
    },
  );

  it('accepts a hyphenated advertiser id, which Meta and Google page slugs use', async () => {
    const dto = plainToInstance(CreateAdWatchedAdvertiserDto, {
      advertiserHandle: 'nike-running',
      platform: 'meta',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('validates with optional fields populated', async () => {
    const dto = plainToInstance(CreateAdWatchedAdvertiserDto, {
      advertiserHandle: 'nike',
      advertiserName: 'Nike',
      brandId: testId('brand'),
      credentialId: testId('credential'),
      externalAdvertiserId: 'ext-123',
      platform: 'tiktok',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects a brandId that is not a valid entity id', async () => {
    const dto = plainToInstance(CreateAdWatchedAdvertiserDto, {
      advertiserHandle: 'nike',
      brandId: 'not-a-cuid',
      platform: 'meta',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'brandId')).toBe(true);
  });
});
