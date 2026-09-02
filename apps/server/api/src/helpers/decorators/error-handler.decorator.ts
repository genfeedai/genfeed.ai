import type { LoggerService } from '@libs/logger/logger.service';

interface WithLogger {
  logger?: LoggerService;
}

/**
 * @HandleErrors Decorator
 *
 * Automatically handles error logging and re-throwing for service methods
 * Eliminates duplicate try-catch blocks across services
 *
 * @example
 * class MyService {
 *   @HandleErrors('create item', 'items')
 *   async create(dto: CreateDto) {
 *     // implementation - no try-catch needed
 *   }
 * }
 */
export function HandleErrors(operation: string, context?: string) {
  return (
    target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: WithLogger, ...args: unknown[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error: unknown) {
        const logger = this.logger;
        const serviceName = target.constructor.name;

        // Log error with context
        // Note: Services using this decorator should always have a logger injected
        if (logger) {
          logger.error(`${serviceName}.${propertyKey} failed`, {
            args: args.length > 0 ? 'provided' : 'none',
            context: context || propertyKey,
            error: (error as Error)?.message,
            operation,
            stack: (error as Error)?.stack,
          });
        }

        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * @HandleErrorsSync Decorator
 *
 * Synchronous version of @HandleErrors for non-async methods
 */
export function HandleErrorsSync(operation: string, context?: string) {
  return (
    target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) => {
    const originalMethod = descriptor.value;

    descriptor.value = function (this: WithLogger, ...args: unknown[]) {
      try {
        return originalMethod.apply(this, args);
      } catch (error: unknown) {
        const logger = this.logger;
        const serviceName = target.constructor.name;

        // Note: Services using this decorator should always have a logger injected
        if (logger) {
          logger.error(`${serviceName}.${propertyKey} failed`, {
            context: context || propertyKey,
            error: (error as Error)?.message,
            operation,
            stack: (error as Error)?.stack,
          });
        }
        // If logger is not available, error is still re-thrown below

        throw error;
      }
    };

    return descriptor;
  };
}
