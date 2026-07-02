import { Prisma } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';

export interface OnboardingErrorOptions {
  /** Fallback error detail used when the caught error is wrapped. */
  detail: string;
  /** Rethrow HttpException as-is instead of wrapping it in a 500. */
  hasHttpExceptionPassthrough?: boolean;
  /**
   * Let known Prisma errors (e.g. P2002 slug collision) bubble to the global
   * DatabaseExceptionFilter, which maps them to the correct 4xx status
   * instead of a generic 500.
   */
  hasPrismaPassthrough?: boolean;
  /** Prefer the caught error's message over the fallback detail. */
  isErrorMessageUsed?: boolean;
  title: string;
}

/**
 * Shared catch prologue for onboarding public methods: logs the failure and
 * maps unknown errors to a 500 HttpException, optionally passing through
 * HttpExceptions and known Prisma errors unchanged.
 */
export async function withOnboardingErrorHandling<T>(
  loggerService: LoggerService,
  caller: string,
  options: OnboardingErrorOptions,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error: unknown) {
    loggerService.error(`${caller} failed`, error);

    if (options.hasHttpExceptionPassthrough && error instanceof HttpException) {
      throw error;
    }

    if (
      options.hasPrismaPassthrough &&
      error instanceof Prisma.PrismaClientKnownRequestError
    ) {
      throw error;
    }

    const detail = options.isErrorMessageUsed
      ? (error as Error)?.message || options.detail
      : options.detail;

    throw new HttpException(
      { detail, title: options.title },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
