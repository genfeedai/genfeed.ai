import type {
  ISubscriptionFailureMeta,
  SubscriptionFailureCode,
} from '@genfeedai/contracts/interfaces/billing';
import { HttpException, type HttpStatus } from '@nestjs/common';

/** Seconds a client should wait before its single bounded retry. */
export const SUBSCRIPTION_BILLING_RETRY_AFTER_SECONDS = 5;
/** Further attempts a client may make after a retryable failure. */
export const SUBSCRIPTION_BILLING_MAX_RETRIES = 1;

type SubscriptionBillingExceptionInput<TCode extends SubscriptionFailureCode> =
  {
    cause?: unknown;
    code: TCode;
    detail: string;
    isRetryable: boolean;
    status: HttpStatus;
    title: string;
  };

/**
 * Base for the subscription billing endpoints' typed failures. The response
 * body carries the public `code`, a safe `detail` and a bounded retry contract
 * in `meta`; the original error stays on `cause` for error tracking and is
 * never serialized.
 */
export class SubscriptionBillingException<
  TCode extends SubscriptionFailureCode = SubscriptionFailureCode,
> extends HttpException {
  public readonly code: TCode;
  public readonly meta: ISubscriptionFailureMeta;
  public readonly title: string;

  constructor(input: SubscriptionBillingExceptionInput<TCode>) {
    const meta: ISubscriptionFailureMeta = {
      isRetryable: input.isRetryable,
      maxRetries: input.isRetryable ? SUBSCRIPTION_BILLING_MAX_RETRIES : 0,
      retryAfterSeconds: input.isRetryable
        ? SUBSCRIPTION_BILLING_RETRY_AFTER_SECONDS
        : null,
    };

    super(
      {
        code: input.code,
        detail: input.detail,
        meta,
        status: input.status,
        title: input.title,
      },
      input.status,
      input.cause === undefined ? undefined : { cause: input.cause },
    );

    this.name = 'SubscriptionBillingException';
    this.code = input.code;
    this.meta = meta;
    this.title = input.title;
    this.message = input.detail;
  }

  public get isRetryable(): boolean {
    return this.meta.isRetryable;
  }
}
