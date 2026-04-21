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

function copyMethodMetadata(source: Function, target: Function): void {
  for (const metadataKey of Reflect.getMetadataKeys(source)) {
    Reflect.defineMetadata(
      metadataKey,
      Reflect.getMetadata(metadataKey, source),
      target,
    );
  }
}

type LoggedMethod = (
  this: Record<string, unknown>,
  ...args: unknown[]
) => unknown;

function createLoggedWrapper(
  originalMethod: LoggedMethod,
  propertyName: string,
  opts: LogMethodOptions,
): LoggedMethod {
  return async function (this: Record<string, unknown>, ...args: unknown[]) {
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
}

/**
 * Method decorator for automatic logging of method execution
 *
 * @param options Configuration options for logging behavior
 * @returns Method decorator
 */
export function LogMethod(options: LogMethodOptions = {}) {
  return (
    targetOrMethod: object | LoggedMethod,
    propertyNameOrContext: string | ClassMethodDecoratorContext,
    descriptor?: PropertyDescriptor,
  ) => {
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

    if (descriptor) {
      const propertyName = propertyNameOrContext as string;
      const originalMethod = descriptor.value as LoggedMethod;
      const wrapper = createLoggedWrapper(originalMethod, propertyName, opts);

      // Preserve the original function name and method metadata for NestJS reflection
      copyMethodMetadata(originalMethod, wrapper);
      Object.defineProperty(wrapper, 'name', { value: propertyName });
      descriptor.value = wrapper;

      return descriptor;
    }

    const context = propertyNameOrContext as ClassMethodDecoratorContext;
    if (typeof targetOrMethod !== 'function' || context.kind !== 'method') {
      throw new TypeError('LogMethod can only decorate methods');
    }

    const propertyName = String(context.name);
    const originalMethod = targetOrMethod as LoggedMethod;
    const wrapper = createLoggedWrapper(originalMethod, propertyName, opts);

    copyMethodMetadata(originalMethod, wrapper);
    Object.defineProperty(wrapper, 'name', { value: propertyName });
    return wrapper;
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
