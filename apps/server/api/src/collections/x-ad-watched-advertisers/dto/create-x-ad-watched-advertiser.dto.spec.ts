import { CreateXAdWatchedAdvertiserDto } from '@api/collections/x-ad-watched-advertisers/dto/create-x-ad-watched-advertiser.dto';
import { testId } from '@helpers/testing/test-id.helper';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('CreateXAdWatchedAdvertiserDto', () => {
  it('validates with only the required handle', async () => {
    const dto = plainToInstance(CreateXAdWatchedAdvertiserDto, {
      advertiserHandle: 'nike',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('canonicalizes whitespace, one leading @, and case', () => {
    const dto = plainToInstance(CreateXAdWatchedAdvertiserDto, {
      advertiserHandle: '  @Nike  ',
    });

    expect(dto.advertiserHandle).toBe('nike');
  });

  it('leaves a handle without an @ prefix untouched', () => {
    const dto = plainToInstance(CreateXAdWatchedAdvertiserDto, {
      advertiserHandle: 'nike',
    });

    expect(dto.advertiserHandle).toBe('nike');
  });

  it('requires advertiserHandle', async () => {
    const dto = plainToInstance(CreateXAdWatchedAdvertiserDto, {});

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'advertiserHandle')).toBe(
      true,
    );
  });

  it.each(['two@@signs', 'has-dash', 'has space', 'sixteencharacters'])(
    'rejects invalid X username %s',
    async (advertiserHandle) => {
      const dto = plainToInstance(CreateXAdWatchedAdvertiserDto, {
        advertiserHandle,
      });

      const errors = await validate(dto);
      expect(
        errors.some((error) => error.property === 'advertiserHandle'),
      ).toBe(true);
    },
  );

  it('validates with optional fields populated', async () => {
    const dto = plainToInstance(CreateXAdWatchedAdvertiserDto, {
      advertiserHandle: 'nike',
      advertiserName: 'Nike',
      brandId: testId('brand'),
      credentialId: testId('credential'),
      externalAdvertiserId: 'ext-123',
    });

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects a brandId that is not a valid entity id', async () => {
    const dto = plainToInstance(CreateXAdWatchedAdvertiserDto, {
      advertiserHandle: 'nike',
      brandId: 'not-a-cuid',
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'brandId')).toBe(true);
  });
});
