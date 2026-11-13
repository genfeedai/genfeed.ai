import {
  redactSensitiveString,
  redactSensitiveValue,
} from '@genfeedai/helpers/security/redact-sensitive-value.helper';
import {
  buildLoggedErrorReport,
  SentryReportThrottle,
} from '@libs/logger/sentry-error-reporter';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { ConsoleLogger, Inject, Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { Logger as winstonLogger } from 'winston';
import type { WideEventRecord } from './wide-event/wide-event.interface';
import {
  readWideEventLevel,
  summarizeWideEvent,
  WIDE_EVENT_TYPE,
} from './wide-event/wide-event.level';

/**
 * Logger runtime boundary (audit risk 9, issue #1097): this winston-backed
 * LoggerService is THE logger for the NestJS backend runtime (all
 * `apps/server/*` services, injected via `@libs/logger/logger.module`).
 * The frontend/Next.js runtime (browser + SSR) uses the pino/Sentry logger
 * at `packages/services/core/logger.service.ts` instead — winston and Nest
 * DI are not browser-compatible. One logger per runtime; do not add a third.
 */
@Injectable()
export class LoggerService extends ConsoleLogger {
  public readonly constructorName: string;
  private readonly sentryThrottle = new SentryReportThrottle();

  constructor(
    @Inject('winston')
    private readonly winston: winstonLogger,
  ) {
    super();
    this.constructorName = String(this.constructor.name);
  }

  public log(message: unknown, context?: unknown): void {
    const contextObj = this.normalizeContext(context);
    this.winston.info(this.normalizeMessage(message), contextObj);
  }

  public warn(message: unknown, context?: unknown): void {
    const contextObj = this.normalizeContext(context);
    this.winston.warn(this.normalizeMessage(message), contextObj);
  }

  public debug(message: unknown, context?: unknown): void {
    const contextObj = this.normalizeContext(context);
    const formattedMessage = this.formatMessage(
      this.normalizeMessage(message),
      contextObj,
    );
    this.winston.debug(formattedMessage, contextObj);
  }

  /**
   * Emits one wide event: a single context-rich record per request or job.
   * Everything the unit of work learned rides on this one line, so do not log
   * per-step lines next to it; enrich the event instead.
   */
  public wideEvent(event: WideEventRecord): void {
    const safeEvent = redactSensitiveValue(event) as Record<string, unknown>;
    this.winston[readWideEventLevel(event)](
      redactSensitiveString(summarizeWideEvent(event)),
      { ...safeEvent, type: WIDE_EVENT_TYPE },
    );
  }

  private normalizeContext(
    context?: unknown,
  ): Record<string, unknown> | undefined {
    if (typeof context === 'string') {
      return { service: redactSensitiveString(context) };
    }
    if (typeof context === 'object' && context !== null) {
      return redactSensitiveValue(context) as Record<string, unknown>;
    }
    return undefined;
  }

  public error(
    message: unknown,
    trace?: string | Error | unknown,
    context?: unknown,
  ): void {
    const contextObj = this.normalizeContext(context);
    const formattedMessage = this.formatMessage(
      this.normalizeMessage(message),
      contextObj,
    );

    const effectiveTrace =
      trace ?? (typeof message === 'string' ? undefined : message);
    const errorData = redactSensitiveValue(
      this.serializeLoggedError(effectiveTrace),
    );
    const errorContext = {
      ...contextObj,
      ...(errorData !== undefined && { error: errorData }),
    };

    // winston already serializes the full error (message, name, stack) into
    // errorContext.error above. Emitting a second line via super.error() only
    // duplicated every backend error in the console — removed. winston is the
    // single sink for this runtime (see class-level boundary note).
    this.winston.error(formattedMessage, errorContext);
    this.reportToSentry(
      this.normalizeMessage(message),
      effectiveTrace,
      contextObj,
      errorData,
    );
  }

  // Caught-and-logged errors never reach Sentry's exception filter, so every
  // server fault logged here is sent too. Never throws: logging must not fail.
  private reportToSentry(
    message: string,
    trace: unknown,
    context: Record<string, unknown> | undefined,
    errorData: unknown,
  ): void {
    try {
      const report = buildLoggedErrorReport({
        context,
        errorData,
        message,
        trace,
      });
      if (
        !report ||
        !this.sentryThrottle.shouldReport(report.fingerprint, Date.now())
      )
        return;
      Sentry.captureException(report.error, {
        extra: report.extra,
        fingerprint: report.fingerprint,
        level: 'error',
        tags: report.tags,
      });
    } catch {
      // Sentry being unavailable must never break the caller's error path.
    }
  }

  private normalizeMessage(message: unknown): string {
    return redactSensitiveString(getErrorMessage(message));
  }

  // Named to avoid colliding with ConsoleLogger.serializeError, added in
  // @nestjs/common 12.1.1 (protected, Error-only). This helper accepts the
  // wider trace values our error() path passes through.
  private serializeLoggedError(trace?: string | Error | unknown): unknown {
    if (trace instanceof Error) {
      const serialized: Record<string, unknown> = {
        message: trace.message,
        name: trace.name,
        stack: trace.stack,
      };

      // twitter-api-v2 errors carry the HTTP status as `code` and X's response
      // body as `data`; without them a 401 cannot be told from a billing error.
      const providerError = trace as unknown as Record<string, unknown>;
      if (
        typeof providerError.code === 'number' ||
        typeof providerError.code === 'string'
      ) {
        serialized.code = providerError.code;
      }
      if (typeof providerError.status === 'number') {
        serialized.status = providerError.status;
      }
      if (
        providerError.data !== null &&
        typeof providerError.data === 'object'
      ) {
        serialized.data = providerError.data;
      }

      // AxiosError properties are non-enumerable — extract explicitly
      const axiosError = trace as unknown as Record<string, unknown>;
      if (axiosError.isAxiosError) {
        serialized.status = axiosError.status;
        serialized.code = axiosError.code;
        if (axiosError.response) {
          const response = axiosError.response as Record<string, unknown>;
          serialized.response = {
            data: response.data,
            status: response.status,
          };
        }
        if (axiosError.config) {
          const config = axiosError.config as Record<string, unknown>;
          serialized.request = {
            method: config.method,
            url: config.url,
          };
        }
      }

      return serialized;
    }
    if (trace !== undefined && trace !== null) {
      return trace;
    }
    return undefined;
  }

  protected formatMessage(
    message: string,
    context?: Record<string, unknown>,
  ): string {
    if (!context?.service && !context?.operation) {
      return message;
    }

    const parts: string[] = [];
    if (context.service && typeof context.service === 'string') {
      parts.push(context.service);
    }
    if (context.operation && typeof context.operation === 'string') {
      parts.push(context.operation);
    }

    return parts.length > 0 ? `[${parts.join('.')}] ${message}` : message;
  }
}
