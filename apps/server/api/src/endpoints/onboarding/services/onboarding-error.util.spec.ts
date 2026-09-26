import { withOnboardingErrorHandling } from '@api/endpoints/onboarding/services/onboarding-error.util';
import { Prisma } from '@genfeedai/prisma';
import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

describe('withOnboardingErrorHandling', () => {
  const logger = { error: vi.fn() };

  it('returns the resolved value', async () => {
    await expect(
      withOnboardingErrorHandling(
        logger as never,
        'createBrand',
        { detail: 'failed', title: 'Onboarding' },
        async () => 'ok',
      ),
    ).resolves.toBe('ok');
  });

  it('passes HttpException and known Prisma errors through when asked', async () => {
    const httpError = new HttpException('Nope', HttpStatus.BAD_REQUEST);
    await expect(
      withOnboardingErrorHandling(
        logger as never,
        'createBrand',
        {
          detail: 'failed',
          hasHttpExceptionPassthrough: true,
          title: 'Onboarding',
        },
        async () => {
          throw httpError;
        },
      ),
    ).rejects.toBe(httpError);

    const prismaError = new Prisma.PrismaClientKnownRequestError('dup', {
      clientVersion: 'test',
      code: 'P2002',
    });
    await expect(
      withOnboardingErrorHandling(
        logger as never,
        'createBrand',
        {
          detail: 'failed',
          hasPrismaPassthrough: true,
          title: 'Onboarding',
        },
        async () => {
          throw prismaError;
        },
      ),
    ).rejects.toBe(prismaError);
  });

  it('wraps unknown errors in a 500 using the fallback or error message', async () => {
    await expect(
      withOnboardingErrorHandling(
        logger as never,
        'createBrand',
        { detail: 'could not create brand', title: 'Onboarding' },
        async () => {
          throw new Error('disk full');
        },
      ),
    ).rejects.toMatchObject({
      response: {
        detail: 'could not create brand',
        title: 'Onboarding',
      },
    });

    await expect(
      withOnboardingErrorHandling(
        logger as never,
        'createBrand',
        {
          detail: 'could not create brand',
          isErrorMessageUsed: true,
          title: 'Onboarding',
        },
        async () => {
          throw new Error('disk full');
        },
      ),
    ).rejects.toMatchObject({
      response: {
        detail: 'disk full',
        title: 'Onboarding',
      },
    });
  });

  it('attaches a stable code to a wrapped 500 without leaking the raw error message (#5080)', async () => {
    await expect(
      withOnboardingErrorHandling(
        logger as never,
        'scrapeBrand',
        {
          code: 'BRAND_SCRAPE_UNKNOWN',
          detail: 'Failed to setup brand',
          title: 'Brand Setup Failed',
        },
        async () => {
          throw new Error('duplicate key value violates constraint secret_x');
        },
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'BRAND_SCRAPE_UNKNOWN',
        detail: 'Failed to setup brand',
        title: 'Brand Setup Failed',
      },
    });
  });

  it('omits the code member entirely when none is configured', async () => {
    await expect(
      withOnboardingErrorHandling(
        logger as never,
        'createBrand',
        { detail: 'could not create brand', title: 'Onboarding' },
        async () => {
          throw new Error('disk full');
        },
      ),
    ).rejects.toMatchObject({
      response: expect.not.objectContaining({ code: expect.anything() }),
    });
  });
});
