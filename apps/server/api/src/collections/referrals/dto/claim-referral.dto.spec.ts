import { ClaimReferralDto } from '@api/collections/referrals/dto/claim-referral.dto';
import { ValidationPipe } from '@api/helpers/pipes/validation.pipe';
import { BadRequestException } from '@nestjs/common';
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

  it('rejects characters outside the opaque referral alphabet', async () => {
    const pipe = new ValidationPipe();

    await expect(
      pipe.transform(
        { code: 'code_with_1' },
        { metatype: ClaimReferralDto, type: 'body' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
