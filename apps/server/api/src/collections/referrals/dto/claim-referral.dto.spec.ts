import { ClaimReferralDto } from '@api/collections/referrals/dto/claim-referral.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { describe, expect, it } from 'vitest';

describe('ClaimReferralDto', () => {
  it('normalizes a copied referral code before validation', async () => {
    const pipe = new ValidationPipe();

    await expect(
      pipe.transform(
        { code: '  ABCDEFGHJKMNPQRS  ' },
        { metatype: ClaimReferralDto, type: 'body' },
      ),
    ).resolves.toMatchObject({ code: 'abcdefghjkmnpqrs' });
  });
});
