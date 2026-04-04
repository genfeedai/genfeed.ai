import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Result of webhook signature validation
 */
export interface WebhookValidationResult<T = unknown> {
  isValid: boolean;
  event?: T;
  error?: string;
}

/**
 * Options for webhook handling
 */
export interface WebhookHandlerOptions {
  /** Whether to process asynchronously (return immediately after validation) */
  processAsync?: boolean;
  /** Delay in ms before async processing starts */
  asyncDelay?: number;
}

/**
 * BaseWebhookController - Abstract base class for webhook controllers
 *
 * Provides common webhook patterns:
 * - Signature validation flow
 * - Logging with constructorName
 * - Error handling wrapper
 * - Async processing support
 *
 * @example
 * @Controller('webhooks/stripe')
 * export class StripeWebhookController extends BaseWebhookController {
 *   constructor(
 *     protected readonly loggerService: LoggerService,
 *     private readonly stripeService: StripeService,
 *   ) {
 *     super(loggerService, StripeWebhookController.name);
 *   }
 *
 *   protected async validateSignature(request: Request): Promise<WebhookValidationResult> {
 *     const signature = request.headers['stripe-signature'] as string;
 *     try {
 *       const event = this.stripeService.stripe.webhooks.constructEvent(
 *         request.body, signature, this.secret
 *       );
 *       return { isValid: true, event };
 *     } catch (error) {
 *       return { isValid: false, error: 'Invalid signature' };
 *     }
 *   }
 *
 *   protected async processWebhook(event: StripeEvent): Promise<void> {
 *     await this.stripeWebhookService.handleWebhookEvent(event);
 *   }
 *
 *   @Post('callback')
 *   async handleCallback(@Req() request: Request) {
 *     return this.handleWebhook(request);
 *   }
 * }
 */
export abstract class BaseWebhookController {
  protected readonly constructorName: string;

  constructor(
    protected readonly loggerService: LoggerService,
    constructorName: string,
  ) {
    this.constructorName = constructorName;
  }

  /**
   * Get the URL identifier for logging
   */
  protected getLogUrl(methodName?: string): string {
    const callerName = methodName || CallerUtil.getCallerName();
    return `${this.constructorName} ${callerName}`;
  }

  /**
   * Validate the webhook signature
   * Must be implemented by subclasses
   *
   * @param request - Express request object
   * @param payload - Parsed request body (if available)
   * @returns Validation result with optional parsed event
   */
  protected abstract validateSignature<T>(
    request: Request,
    payload?: unknown,
  ): Promise<WebhookValidationResult<T>>;

  /**
   * Process the webhook event
   * Must be implemented by subclasses
   *
   * @param event - The validated webhook event
   * @param url - Log URL identifier
   */
  protected abstract processWebhook<T>(event: T, url: string): Promise<void>;

  /**
   * Handle a webhook request with standard flow:
   * 1. Log receipt
   * 2. Validate signature
   * 3. Process webhook (sync or async)
   * 4. Return success response
   *
   * @param request - Express request object
   * @param payload - Parsed request body (if available)
   * @param options - Handler options
   * @returns Success response
   */
  protected async handleWebhook<T>(
    request: Request,
    payload?: unknown,
    options: WebhookHandlerOptions = {},
  ): Promise<{ success: boolean; detail?: string }> {
    const url = this.getLogUrl('handleWebhook');

    try {
      // Log receipt
      this.loggerService.log(`${url} received`, payload);

      // Validate signature
      const validationResult = await this.validateSignature<T>(
        request,
        payload,
      );

      if (!validationResult.isValid) {
        this.loggerService.error(`${url} invalid signature`, {
          error: validationResult.error,
        });
        throw new HttpException(
          validationResult.error || 'Invalid webhook signature',
          HttpStatus.UNAUTHORIZED,
        );
      }

      this.loggerService.log(
        `${url} webhook validated`,
        validationResult.event,
      );

      // Process webhook
      if (options.processAsync) {
        // Process asynchronously - return immediately
        setImmediate(() => {
          this.processWebhook(validationResult.event, url).catch(
            (error: unknown) => {
              this.loggerService.error(`${url} async processing failed`, {
                error,
                event: validationResult.event,
              });
            },
          );
        });
        return { detail: 'Webhook received', success: true };
      } else {
        // Process synchronously
        await this.processWebhook(validationResult.event, url);
        return { success: true };
      }
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Webhook processing failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Handle a webhook with raw body validation
   * Use this when the webhook requires raw body for signature validation
   *
   * @param request - Express request with raw body
   * @param options - Handler options
   */
  protected handleWebhookWithRawBody<T>(
    request: Request,
    options: WebhookHandlerOptions = {},
  ): Promise<{ success: boolean; detail?: string }> {
    const rawBody = request.body as Buffer;
    const payload = JSON.parse(rawBody.toString());
    return this.handleWebhook<T>(request, payload, options);
  }
}
