import { ClaimReferralDto } from '@api/collections/referrals/dto/claim-referral.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

describe('ClaimReferralDto', () => {
  it('normalizes a copied referral code before validation', async () => {
    const dto = plainToInstance(ClaimReferralDto, {
      code: '  ABCDEFGHJKMNPQRS  ',
    });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.code).toBe('abcdefghjkmnpqrs');
  });

  it('rejects characters outside the opaque referral alphabet', async () => {
    const dto = plainToInstance(ClaimReferralDto, { code: 'code_with_1' });

    await expect(validate(dto)).resolves.not.toEqual([]);
  });
});
