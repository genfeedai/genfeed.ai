import { IngredientStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import type { Job } from 'bullmq';

/**
 * Error context for processor error handling
 */
export interface ProcessorErrorContext {
  /** The job being processed */
  job: Job;
  /** Human-readable operation name */
  operation: string;
  /** Entity ID being processed (ingredient, asset, etc.) */
  entityId?: string;
  /** Entity type for context */
  entityType?: 'ingredient' | 'asset' | 'post' | 'training';
  /** Additional context for logging */
  metadata?: Record<string, unknown>;
}

/**
 * Error result for consistent error response
 */
export interface ProcessorErrorResult {
  success: false;
  error: string;
  errorCode?: string;
  entityId?: string;
}

/**
 * Success result for consistent success response
 */
export interface ProcessorSuccessResult<T = unknown> {
  success: true;
  data?: T;
  entityId?: string;
}

export type ProcessorResult<T = unknown> =
  | ProcessorSuccessResult<T>
  | ProcessorErrorResult;

/**
 * Service dependencies for error handling
 */
export interface ProcessorErrorServices {
  logger: LoggerService;
  updateStatus?: (
    id: string,
    status: IngredientStatus,
    error?: string,
  ) => Promise<void>;
  publishError?: (
    entityId: string,
    error: string,
    userId?: string,
  ) => Promise<void>;
}

/**
 * ProcessorErrorHandler - Utility for standardized processor error handling
 *
 * Provides consistent error handling patterns for queue processors:
 * - Logging with context
 * - Status updates (FAILED status)
 * - WebSocket error notifications
 * - Consistent error response format
 *
 * @example
 * const handler = new ProcessorErrorHandler(logger, {
 *   updateStatus: (id, status) => ingredientsService.patch(id, { status }),
 *   publishError: (id, error, userId) => websocketService.publishError(id, error, userId),
 * });
 *
 * try {
 *   // Process job...
 * } catch (error) {
 *   return handler.handleError(error, {
 *     job,
 *     operation: 'resize video',
 *     entityId: data.ingredientId,
 *     entityType: 'ingredient',
 *   });
 * }
 */
export class ProcessorErrorHandler {
  constructor(
    private readonly logger: LoggerService,
    private readonly services?: Partial<ProcessorErrorServices>,
  ) {}

  /**
   * Handle processor error with standard flow
   *
   * 1. Log the error with context
   * 2. Update entity status to FAILED (if service provided)
   * 3. Publish error via WebSocket (if service provided)
   * 4. Return consistent error result
   *
   * @param error - The caught error
   * @param context - Error context
   * @returns ProcessorErrorResult
   */
  async handleError(
    error: unknown,
    context: ProcessorErrorContext,
  ): Promise<ProcessorErrorResult> {
    const errorMessage = this.extractErrorMessage(error);
    const logContext = this.buildLogContext(context, errorMessage);

    // 1. Log the error
    this.logger.error(`${context.operation} failed`, logContext);

    // 2. Update status to FAILED if service available
    if (this.services?.updateStatus && context.entityId) {
      try {
        await this.services.updateStatus(
          context.entityId,
          IngredientStatus.FAILED,
          errorMessage,
        );
      } catch (updateError) {
        this.logger.error(`Failed to update status`, {
          entityId: context.entityId,
          error: updateError,
        });
      }
    }

    // 3. Publish error via WebSocket if service available
    if (this.services?.publishError && context.entityId) {
      try {
        const userId = this.extractUserId(context);
        await this.services.publishError(
          context.entityId,
          errorMessage,
          userId,
        );
      } catch (publishError) {
        this.logger.error(`Failed to publish error`, {
          entityId: context.entityId,
          error: publishError,
        });
      }
    }

    // 4. Return consistent error result
    return {
      entityId: context.entityId,
      error: errorMessage,
      errorCode: this.extractErrorCode(error),
      success: false,
    };
  }

  /**
   * Handle processor success with standard logging
   *
   * @param context - Success context
   * @param data - Optional result data
   * @returns ProcessorSuccessResult
   */
  handleSuccess<T>(
    context: Omit<ProcessorErrorContext, 'job'> & { job?: Job },
    data?: T,
  ): ProcessorSuccessResult<T> {
    this.logger.log(`${context.operation} completed`, {
      entityId: context.entityId,
      entityType: context.entityType,
      jobId: context.job?.id,
      ...context.metadata,
    });

    return {
      data,
      entityId: context.entityId,
      success: true,
    };
  }

  /**
   * Wrap a processor function with error handling
   *
   * @param fn - Async function to wrap
   * @param context - Base error context (job will be added from fn params)
   * @returns Wrapped function that catches errors
   *
   * @example
   * const wrappedProcess = handler.wrapProcessor(
   *   async (job) => {
   *     // Process logic...
   *     return { outputPath: '/path/to/output' };
   *   },
   *   { operation: 'process video', entityType: 'ingredient' }
   * );
   */
  wrapProcessor<TData, TResult>(
    fn: (job: Job<TData>) => Promise<TResult>,
    baseContext: Omit<ProcessorErrorContext, 'job'>,
  ): (job: Job<TData>) => Promise<ProcessorResult<TResult>> {
    return async (job: Job<TData>): Promise<ProcessorResult<TResult>> => {
      const context: ProcessorErrorContext = {
        ...baseContext,
        entityId:
          baseContext.entityId ||
          ((job.data as Record<string, unknown>).ingredientId as string) ||
          ((job.data as Record<string, unknown>).assetId as string),
        job,
      };

      try {
        const result = await fn(job);
        return this.handleSuccess(context, result);
      } catch (error) {
        return this.handleError(error, context);
      }
    };
  }

  /**
   * Extract error message from various error types
   */
  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    if (typeof error === 'object' && error !== null && 'message' in error) {
      return String((error as { message: unknown }).message);
    }

    return 'Unknown error occurred';
  }

  /**
   * Extract error code if available
   */
  private extractErrorCode(error: unknown): string | undefined {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      return String((error as { code: unknown }).code);
    }
    return undefined;
  }

  /**
   * Build log context object
   */
  private buildLogContext(
    context: ProcessorErrorContext,
    errorMessage: string,
  ): Record<string, unknown> {
    return {
      entityId: context.entityId,
      entityType: context.entityType,
      error: errorMessage,
      jobId: context.job.id,
      operation: context.operation,
      ...context.metadata,
    };
  }

  /**
   * Extract user ID from context
   */
  private extractUserId(context: ProcessorErrorContext): string | undefined {
    const jobData = context.job.data as Record<string, unknown>;
    return (
      (jobData.userId as string) || (jobData.clerkUserId as string) || undefined
    );
  }
}

/**
 * Factory function to create ProcessorErrorHandler
 *
 * @example
 * const handler = createProcessorErrorHandler(logger, {
 *   updateStatus: async (id, status) => {
 *     await ingredientsService.patch(id, { status });
 *   },
 * });
 */
export function createProcessorErrorHandler(
  logger: LoggerService,
  services?: Partial<ProcessorErrorServices>,
): ProcessorErrorHandler {
  return new ProcessorErrorHandler(logger, services);
}
