import { OssCreditsUtilsService } from '@api/common/credits/oss-credits-utils.service';
import { usesMeteredCredits } from '@genfeedai/config';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

const CREDITS_UTILS_TOKEN = 'CreditsUtilsService';

/**
 * Mirrors CreditsModule's provider branch. Nest evaluates useClass at module
 * definition time; we re-evaluate usesMeteredCredits() per stubbed env.
 */
function bindCreditsUtilsClass(): typeof OssCreditsUtilsService {
  // Real CreditsUtilsService is not imported here — it pulls Prisma. The branch
  // under test is only which class token is selected; OSS stub is the known
  // community path, and metered path is asserted via usesMeteredCredits().
  return usesMeteredCredits()
    ? (class MeteredCreditsMarker {} as unknown as typeof OssCreditsUtilsService)
    : OssCreditsUtilsService;
}

describe('CreditsModule metered-credits DI branch', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('selects OSS infinite stub when not SaaS and no EE license', async () => {
    vi.stubEnv('GENFEED_CLOUD', '');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', '');
    vi.stubEnv('GENFEED_LICENSE_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '');

    expect(usesMeteredCredits()).toBe(false);

    const module = await Test.createTestingModule({
      providers: [
        {
          provide: CREDITS_UTILS_TOKEN,
          useClass: bindCreditsUtilsClass(),
        },
      ],
    }).compile();

    expect(module.get(CREDITS_UTILS_TOKEN)).toBeInstanceOf(
      OssCreditsUtilsService,
    );
  });

  it('selects metered path on SaaS without a license key', () => {
    vi.stubEnv('GENFEED_LICENSE_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_LICENSE_KEY', '');
    vi.stubEnv('GENFEED_CLOUD', 'true');
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '');

    expect(usesMeteredCredits()).toBe(true);
    // Branch picks the non-OSS marker class (not OssCreditsUtilsService).
    expect(bindCreditsUtilsClass()).not.toBe(OssCreditsUtilsService);
  });

  it('selects metered path on self-host with EE license', () => {
    vi.stubEnv('GENFEED_CLOUD', '');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', '');
    vi.stubEnv('GENFEED_LICENSE_KEY', 'test-key-123');
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '');

    expect(usesMeteredCredits()).toBe(true);
    expect(bindCreditsUtilsClass()).not.toBe(OssCreditsUtilsService);
  });
});
