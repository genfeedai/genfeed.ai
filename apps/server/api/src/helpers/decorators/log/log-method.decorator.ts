import { LoggerService } from '@libs/logger/logger.service';

export interface LogMethodOptions {
  logStart?: boolean;
  logEnd?: boolean;
  logError?: boolean;
  logArgs?: boolean;
  logResult?: boolean;
  level?: 'debug' | 'log' | 'verbose';
}

const defaultOptions: LogMethodOptions = {
  level: 'log',
  logArgs: false,
  logEnd: true,
  logError: true,
  logResult: false,
  logStart: true,
};

/**
 * Method decorator for automatic logging of method execution
 *
 * @param options Configuration options for logging behavior
 * @returns Method decorator
 */
export function LogMethod(options: LogMethodOptions = {}) {
  return (
    _target: object,
    propertyName: string,
    descriptor: PropertyDescriptor,
  ) => {
    const originalMethod = descriptor.value;
    const opts = { ...defaultOptions, ...options };

    // In production, automatically disable logStart and logEnd, but keep error logging
    // Only apply defaults if not explicitly configured (respect explicit decorator settings)
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
      // Only override logStart if not explicitly set
      if (options.logStart === undefined) {
        opts.logStart = false;
      }
      // Only override logEnd if not explicitly set (allows LogPerformance to work)
      if (options.logEnd === undefined) {
        opts.logEnd = false;
      }
      // Always log errors in production unless explicitly disabled
      if (options.logError !== false) {
        opts.logError = true;
      }
    }

    // Create wrapper function and preserve the original function name
    // This is critical for NestJS guards/interceptors that use context.getHandler().name
    const wrapper = async function (
      this: Record<string, unknown>,
      ...args: unknown[]
    ) {
      const className = this.constructor.name;
      const methodName = `${className}.${propertyName}`;
      const baseContext: Record<string, unknown> = {
        operation: propertyName,
        service: className,
      };
      const logger: LoggerService | undefined =
        (this.logger as LoggerService) || (this.loggerService as LoggerService);

      if (!logger) {
        // If no logger is available, just execute the method
        return originalMethod.apply(this, args);
      }

      const startTime = Date.now();
      const logAtLevel =
        typeof logger[opts.level!] === 'function'
          ? logger[opts.level!].bind(logger)
          : typeof logger.log === 'function'
            ? logger.log.bind(logger)
            : undefined;

      // Log method start
      if (opts.logStart && logAtLevel) {
        const logData: Record<string, unknown> = { ...baseContext };
        if (opts.logArgs && args.length > 0) {
          logData.args = args;
        }
        logAtLevel(`${methodName} started`, logData);
      }

      try {
        // Execute the original method
        const result = await originalMethod.apply(this, args);
        const executionTime = Date.now() - startTime;

        // Log method completion
        if (opts.logEnd && logAtLevel) {
          const logData: Record<string, unknown> = {
            ...baseContext,
            executionTime: `${executionTime}ms`,
          };
          if (opts.logResult && result !== undefined) {
            logData.result = result;
          }
          logAtLevel(`${methodName} completed`, logData);
        }

        return result;
      } catch (error: unknown) {
        const executionTime = Date.now() - startTime;

        // Log method failure
        if (opts.logError && typeof logger.error === 'function') {
          logger.error(`${methodName} failed`, {
            ...baseContext,
            error:
              error instanceof Error
                ? {
                    message: error.message,
                    name: error.name,
                    stack: error.stack,
                  }
                : error,
            executionTime: `${executionTime}ms`,
            ...(opts.logArgs && args.length > 0 && { args }),
          });
        }

        throw error;
      }
    };

    // Preserve the original function name for NestJS reflection
    Object.defineProperty(wrapper, 'name', { value: propertyName });
    descriptor.value = wrapper;

    return descriptor;
  };
}

/**
 * Simplified decorator for debug-level logging with minimal output
 */
export function LogDebug() {
  return LogMethod({
    level: 'debug',
    logArgs: false,
    logEnd: true,
    logError: true,
    logResult: false,
    logStart: true,
  });
}

/**
 * Decorator for verbose logging with arguments and results
 */
export function LogVerbose() {
  return LogMethod({
    level: 'verbose',
    logArgs: true,
    logEnd: true,
    logError: true,
    logResult: true,
    logStart: true,
  });
}

/**
 * Decorator that only logs errors
 */
export function LogErrors() {
  return LogMethod({
    logArgs: true,
    logEnd: false,
    logError: true,
    logResult: false,
    logStart: false,
  });
}

/**
 * Performance-focused decorator that logs execution time
 */
export function LogPerformance() {
  return LogMethod({
    level: 'debug',
    logArgs: false,
    logEnd: true,
    logError: true,
    logResult: false,
    logStart: false,
  });
}
