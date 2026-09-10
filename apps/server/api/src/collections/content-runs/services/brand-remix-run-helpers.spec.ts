import {
  remixCredentialPlatform,
  remixOrganicPlatform,
  remixPaidPlatform,
  remixRecommendedOutputKind,
  remixSourcePlatform,
} from '@api/collections/content-runs/services/brand-remix-run-helpers';
import { Platform } from '@genfeedai/contracts';
import {
  BrandRemixAdPlatform,
  BrandRemixOrganicPlatform,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { CredentialPlatform } from '@genfeedai/prisma';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

describe('remixSourcePlatform', () => {
  it('accepts remix enum values', () => {
    expect(remixSourcePlatform(BrandRemixOrganicPlatform.INSTAGRAM)).toBe(
      BrandRemixOrganicPlatform.INSTAGRAM,
    );
    expect(remixSourcePlatform(BrandRemixAdPlatform.META)).toBe(
      BrandRemixAdPlatform.META,
    );
    expect(remixSourcePlatform(BrandRemixOrganicPlatform.X)).toBe(
      BrandRemixOrganicPlatform.X,
    );
  });

  it('maps post and ads aliases onto the remix enum', () => {
    expect(remixSourcePlatform(Platform.FACEBOOK)).toBe(
      BrandRemixAdPlatform.META,
    );
    expect(remixSourcePlatform('facebook_ads')).toBe(BrandRemixAdPlatform.META);
    expect(remixSourcePlatform(Platform.GOOGLE_ADS)).toBe(
      BrandRemixAdPlatform.GOOGLE,
    );
    expect(remixSourcePlatform(Platform.TWITTER)).toBe(BrandRemixAdPlatform.X);
    expect(remixSourcePlatform(Platform.X_ADS)).toBe(BrandRemixAdPlatform.X);
    expect(remixSourcePlatform('Twitter')).toBe(BrandRemixAdPlatform.X);
  });

  it('rejects platforms outside the remix vocabulary', () => {
    expect(() => remixSourcePlatform(Platform.LINKEDIN)).toThrow(
      BadRequestException,
    );
    expect(() => remixSourcePlatform(undefined)).toThrow(BadRequestException);
  });
});

describe('remixOrganicPlatform', () => {
  it('returns the organic remix enum instead of a string union', () => {
    expect(remixOrganicPlatform(BrandRemixOrganicPlatform.INSTAGRAM)).toBe(
      BrandRemixOrganicPlatform.INSTAGRAM,
    );
    expect(remixOrganicPlatform(BrandRemixOrganicPlatform.TIKTOK)).toBe(
      BrandRemixOrganicPlatform.TIKTOK,
    );
    expect(remixOrganicPlatform(BrandRemixOrganicPlatform.YOUTUBE)).toBe(
      BrandRemixOrganicPlatform.YOUTUBE,
    );
    expect(remixOrganicPlatform(BrandRemixOrganicPlatform.X)).toBe(
      BrandRemixOrganicPlatform.X,
    );
  });

  it('rejects paid-only remix platforms', () => {
    expect(() => remixOrganicPlatform(BrandRemixAdPlatform.META)).toThrow(
      BadRequestException,
    );
    expect(() => remixOrganicPlatform(BrandRemixAdPlatform.GOOGLE)).toThrow(
      BadRequestException,
    );
  });
});

describe('remixPaidPlatform', () => {
  it('returns the paid remix enum', () => {
    expect(remixPaidPlatform(BrandRemixAdPlatform.META)).toBe(
      BrandRemixAdPlatform.META,
    );
    expect(remixPaidPlatform(BrandRemixAdPlatform.X)).toBe(
      BrandRemixAdPlatform.X,
    );
  });

  it('rejects organic-only remix platforms', () => {
    expect(() =>
      remixPaidPlatform(BrandRemixOrganicPlatform.INSTAGRAM),
    ).toThrow(BadRequestException);
    expect(() => remixPaidPlatform(BrandRemixOrganicPlatform.YOUTUBE)).toThrow(
      BadRequestException,
    );
  });
});

describe('remixRecommendedOutputKind', () => {
  it('remixes X text as copy and visual sources as image or video', () => {
    expect(remixRecommendedOutputKind(BrandRemixOrganicPlatform.X, false)).toBe(
      'copy',
    );
    expect(remixRecommendedOutputKind(BrandRemixOrganicPlatform.X, true)).toBe(
      'video',
    );
    expect(
      remixRecommendedOutputKind(BrandRemixOrganicPlatform.INSTAGRAM, false),
    ).toBe('image');
    expect(
      remixRecommendedOutputKind(BrandRemixOrganicPlatform.TIKTOK, true),
    ).toBe('video');
  });
});

describe('remixCredentialPlatform', () => {
  it('maps paid remix platforms onto Prisma credential platforms', () => {
    expect(remixCredentialPlatform(BrandRemixAdPlatform.META)).toBe(
      CredentialPlatform.FACEBOOK,
    );
    expect(remixCredentialPlatform(BrandRemixAdPlatform.GOOGLE)).toBe(
      CredentialPlatform.GOOGLE_ADS,
    );
    expect(remixCredentialPlatform(BrandRemixAdPlatform.X)).toBe(
      CredentialPlatform.X_ADS,
    );
    expect(remixCredentialPlatform(BrandRemixAdPlatform.TIKTOK)).toBe(
      CredentialPlatform.TIKTOK,
    );
  });
});
