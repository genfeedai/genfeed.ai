import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { crunImageQuoteIntentSchema } from '@api/collections/images/dto/create-crun-image-quote.dto';
import { crunVideoQuoteIntentSchema } from '@api/collections/videos/dto/create-crun-video-quote.dto';
import {
  CRUN_IMAGE_MANIFEST,
  CRUN_VIDEO_MANIFEST,
} from '@api/services/integrations/crun/contracts/crun-manifest';
import {
  normalizeCrunQuoteIntent,
  readReviewedCrunContract,
  validateCrunPromptProvenance,
} from '@api/services/integrations/crun/crun-quote-input.util';
import { ModelCategory } from '@genfeedai/contracts';
import { BadRequestException } from '@nestjs/common';

const user = {
  brandId: 'default-brand',
  organizationId: 'org-1',
  userId: 'user-1',
} as AuthenticatedUser;

describe('crun-quote-input.util', () => {
  it('rejects an invalid intent with field errors', () => {
    expect(() =>
      normalizeCrunQuoteIntent(crunVideoQuoteIntentSchema, {}, user),
    ).toThrow(BadRequestException);
  });

  it('accepts every manifest model in its media kind schema', () => {
    const request = (model: string) => ({
      model,
      text: 'hello',
      crunControls: { contractVersion: 'v1' },
    });
    for (const entry of CRUN_VIDEO_MANIFEST) {
      expect(
        crunVideoQuoteIntentSchema.safeParse(request(entry.key)).success,
      ).toBe(true);
    }
    for (const entry of CRUN_IMAGE_MANIFEST) {
      expect(
        crunImageQuoteIntentSchema.safeParse(request(entry.key)).success,
      ).toBe(true);
    }
    expect(
      crunVideoQuoteIntentSchema.safeParse(request('crun/nope/model')).success,
    ).toBe(false);
    expect(
      crunImageQuoteIntentSchema.safeParse(request('crun/nope/model')).success,
    ).toBe(false);
  });

  it('requires an enhanced prompt when skills or a harness are requested', async () => {
    const prisma = { prompt: { findFirst: vi.fn() } };
    const reason = await validateCrunPromptProvenance(
      prisma as never,
      {
        crunControls: { contractVersion: 'v1' },
        harness: true,
        model: 'crun/x/y',
        outputs: 1,
        requestedSkillSlugs: [],
        text: 'hi',
      },
      user,
      'brand-1',
    );
    expect(reason).toBe('CRUN_ENHANCEMENT_REQUIRED');
    expect(prisma.prompt.findFirst).not.toHaveBeenCalled();
  });

  it('refuses a model whose category differs from the media kind', async () => {
    const models = {
      findOne: vi.fn().mockResolvedValue({
        category: ModelCategory.IMAGE,
        isActive: true,
        isDeleted: false,
        provider: 'crun',
      }),
    };
    const result = await readReviewedCrunContract(
      models as never,
      {
        crunControls: { contractVersion: 'v1' },
        model: 'crun/x/y',
        outputs: 1,
        requestedSkillSlugs: [],
        text: 'hi',
      },
      user,
      { category: ModelCategory.VIDEO, mediaKind: 'video' },
    );
    expect(result).toEqual({
      isAvailable: false,
      reasonCode: 'CRUN_MODEL_UNAVAILABLE',
    });
  });
});
