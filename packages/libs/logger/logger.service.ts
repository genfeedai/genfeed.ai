import { ConsoleLogger, Inject, Injectable } from '@nestjs/common';
import type { Logger as winstonLogger } from 'winston';

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

  constructor(
    @Inject('winston')
    private readonly winston: winstonLogger,
  ) {
    super();
    this.constructorName = String(this.constructor.name);
  }

  public log(message: string, context?: unknown): void {
    const contextObj = this.normalizeContext(context);
    this.winston.info(message, contextObj);
  }

  public warn(message: string, context?: unknown): void {
    const contextObj = this.normalizeContext(context);
    this.winston.warn(message, contextObj);
  }

  public debug(message: string, context?: unknown): void {
    const contextObj = this.normalizeContext(context);
    const formattedMessage = this.formatMessage(message, contextObj);
    this.winston.debug(formattedMessage, contextObj);
  }

  private normalizeContext(
    context?: unknown,
  ): Record<string, unknown> | undefined {
    if (typeof context === 'string') {
      return { service: context };
    }
    if (typeof context === 'object' && context !== null) {
      return context as Record<string, unknown>;
    }
    return undefined;
  }

  public error(
    message: string,
    trace?: string | Error | unknown,
    context?: unknown,
  ): void {
    const contextObj = this.normalizeContext(context);
    const formattedMessage = this.formatMessage(message, contextObj);

    const errorData = this.serializeError(trace);
    const errorContext = {
      ...contextObj,
      ...(errorData !== undefined && { error: errorData }),
    };

    // winston already serializes the full error (message, name, stack) into
    // errorContext.error above. Emitting a second line via super.error() only
    // duplicated every backend error in the console — removed. winston is the
    // single sink for this runtime (see class-level boundary note).
    this.winston.error(formattedMessage, errorContext);
  }

  private serializeError(trace?: string | Error | unknown): unknown {
    if (trace instanceof Error) {
      const serialized: Record<string, unknown> = {
        message: trace.message,
        name: trace.name,
        stack: trace.stack,
      };

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
