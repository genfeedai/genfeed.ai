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
});
