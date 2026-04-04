import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import {
  baseModelKey,
  isFalDestination,
  isReplicateDestination,
  isReplicateVersionId,
  isTrainerKey,
  isTrainingKey,
} from '@api/collections/models/utils/model-key.util';
import { ConfigService } from '@api/config/config.service';
import {
  CREDITS_DEFER_MODEL_RESOLUTION_KEY,
  CREDITS_KEY,
} from '@api/helpers/decorators/credits/credits.decorator';
import { InsufficientCreditsException } from '@api/helpers/exceptions/business/business-logic.exception';
import { getMinimumTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { ByokService } from '@api/services/byok/byok.service';
import {
  modelKeyToByokProvider,
  modelProviderToByokProvider,
} from '@api/services/byok/byok-provider-map.util';
import type { IClerkPublicMetadata } from '@api/shared/interfaces/clerk/clerk.interface';
import type { CreditsConfig } from '@genfeedai/interfaces';
import { type ByokProvider, PricingType } from '@genfeedai/enums';
import { getDeserializer } from '@genfeedai/helpers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

// Type for authenticated request with user data
interface AuthenticatedRequest extends Omit<Request, 'user'> {
  user?: {
    id?: string;
    publicMetadata: IClerkPublicMetadata;
  };
  creditsConfig?: CreditsConfig & {
    amount: number;
    modelKey?: string;
    deferred?: boolean;
  };
}

// DTO for credits body validation
interface CreditsRequestBody {
  model?: string;
  outputs?: number;
  steps?: number;
  resolution?: string;
  width?: number;
  height?: number;
  duration?: number;
  [key: string]: unknown;
}

@Injectable()
export class CreditsGuard implements CanActivate {
  // Credit calculation constants
  private readonly TRAINING_MODEL_FLAT_COST = 5;
  private readonly DEFAULT_TRAINING_STEPS = 1000;
  private readonly TRAINING_CREDITS_PER_THOUSAND_STEPS = 500;

  constructor(
    private reflector: Reflector,

    private creditsUtilsService: CreditsUtilsService,
    private modelsService: ModelsService,
    private byokService: ByokService,

    private loggerService: LoggerService,
    private configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const creditsConfig = this.reflector.getAllAndOverride<CreditsConfig>(
      CREDITS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const shouldDeferModelResolution =
      this.reflector.getAllAndOverride<boolean>(
        CREDITS_DEFER_MODEL_RESOLUTION_KEY,
        [context.getHandler(), context.getClass()],
      ) === true;

    this.loggerService.debug('Credits guard: metadata check', {
      hasCreditsConfig: !!creditsConfig,
      shouldDeferModelResolution,
    });

    if (!creditsConfig) {
      return true; // No credits required for this endpoint
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    const publicMetadata: IClerkPublicMetadata | undefined =
      user?.publicMetadata;

    if (!user || !publicMetadata) {
      this.loggerService.warn('Credits guard: No user found in request');
      throw new InsufficientCreditsException(0, 0);
    }

    try {
      let requiredCredits: number;

      // Try to get model and outputs from request body (supports JSON:API data.attributes)
      let modelKey: string | undefined;
      let outputs = 1;
      let body: CreditsRequestBody | null = null;

      const rawBody = request.body;

      const rawAttributes = rawBody?.data?.attributes || rawBody?.attributes;
      modelKey =
        rawAttributes?.model ||
        rawAttributes?.modelKey ||
        rawBody?.model ||
        rawBody?.modelKey;
      outputs = Number(rawAttributes?.outputs ?? rawBody?.outputs) || 1;

      // Extract dimensions and duration for dynamic pricing
      let width = Number(rawAttributes?.width ?? rawBody?.width) || 0;
      let height = Number(rawAttributes?.height ?? rawBody?.height) || 0;
      let duration = Number(rawAttributes?.duration ?? rawBody?.duration) || 0;

      this.loggerService.debug('Credits guard: incoming request body parsed', {
        duration,
        hasDataAttributes: !!rawAttributes,
        height,
        modelKey,
        outputs,
        width,
      });

      try {
        const deserializedBody = await getDeserializer(request.body);
        body = (deserializedBody as CreditsRequestBody) || request.body;

        const bodyRecord = body as Record<string, unknown>;
        const dataObj = bodyRecord?.data as Record<string, unknown> | undefined;
        const attributes =
          (dataObj?.attributes as Record<string, unknown>) ||
          (bodyRecord?.attributes as Record<string, unknown>);
        modelKey =
          modelKey ||
          body?.model ||
          (bodyRecord?.modelKey as string) ||
          (attributes?.model as string) ||
          (attributes?.modelKey as string);
        outputs =
          Number(body?.outputs ?? attributes?.outputs ?? outputs) || outputs;

        // Update dimensions and duration from deserialized body
        width = Number(body?.width ?? attributes?.width ?? width) || width;
        height = Number(body?.height ?? attributes?.height ?? height) || height;
        duration =
          Number(body?.duration ?? attributes?.duration ?? duration) ||
          duration;

        this.loggerService.debug('Credits guard: Extracted model from body', {
          attributeKeys: attributes ? Object.keys(attributes) : [],
          bodyKeys: Object.keys(body || {}),
          duration,
          height,
          modelKey,
          width,
        });
      } catch (error: unknown) {
        this.loggerService.warn('Credits guard: Failed to deserialize body', {
          error: error,
        });
        body = request.body as CreditsRequestBody;
      }

      // Hoisted model reference for BYOK provider resolution
      let resolvedModel: {
        provider?: string;
        cost?: number;
        pricingType?: PricingType;
        costPerUnit?: number;
        minCost?: number;
        label?: string;
        key?: string;
      } | null = null;

      // Determine credits required: from model in body, modelKey in decorator, or fixed amount
      if (modelKey) {
        const normalized = baseModelKey(modelKey);
        // Special handling for Replicate training model (trainer): credits scale with steps
        if (isTrainerKey(normalized)) {
          requiredCredits = this.calculateTrainingCredits(body?.steps);
          this.loggerService.debug(
            'Credits guard: Training credits calculated',
            {
              modelKey,
              requiredCredits,
              steps: body?.steps || this.DEFAULT_TRAINING_STEPS,
            },
          );

          // Store and short-circuit normal model lookup for training
          const updatedCreditsConfig = {
            ...creditsConfig,
            amount: requiredCredits,
            modelKey,
          };
          request.creditsConfig = updatedCreditsConfig;
          // Continue to balance check below
        } else if (
          isFalDestination(modelKey) ||
          isReplicateDestination(modelKey) ||
          isReplicateVersionId(modelKey)
        ) {
          // Dynamic provider destination/version: use custom model fallback cost
          requiredCredits = this.getCustomModelCost();
          this.loggerService.debug(
            'Credits guard: Dynamic provider destination detected, applying custom model cost',
            { modelKey, requiredCredits },
          );

          const updatedCreditsConfig = {
            ...creditsConfig,
            amount: requiredCredits,
            modelKey,
          };
          request.creditsConfig = updatedCreditsConfig;
        } else if (isTrainingKey(modelKey)) {
          // Trained model (genfeedai/<id>): use custom model cost
          requiredCredits = this.getCustomModelCost();
          this.loggerService.debug(
            'Credits guard: Trained model detected, applying custom model cost',
            { modelKey, requiredCredits },
          );

          const updatedCreditsConfig = {
            ...creditsConfig,
            amount: requiredCredits,
            modelKey,
          };
          request.creditsConfig = updatedCreditsConfig;
        } else {
          // Try to find model in database first (for known models like Ideogram, Imagen, nano-banana-pro, etc.)
          const model = await this.modelsService.findOne({
            isDeleted: false,
            key: normalized,
          });

          if (model) {
            resolvedModel = model;
            // Model found in database - use database cost or dynamic pricing
            this.loggerService.debug('Credits guard: Model found in database', {
              cost: model.cost,
              costPerUnit: model.costPerUnit,
              databaseKey: model.key,
              label: model.label,
              minCost: model.minCost,
              modelKey: normalized,
              pricingType: model.pricingType,
            });

            // If model label indicates training, override cost to flat training cost
            if (model.label?.toLowerCase().includes('training')) {
              requiredCredits = this.TRAINING_MODEL_FLAT_COST;
              this.loggerService.debug(
                'Credits guard: Training model label detected, flat credits applied',
                { label: model.label, modelKey: normalized, requiredCredits },
              );
            } else {
              // Use dynamic pricing calculation
              requiredCredits = this.calculateDynamicCost(
                model,
                width,
                height,
                duration,
              );
            }
          } else if (
            isFalDestination(modelKey) ||
            isReplicateDestination(modelKey) ||
            isReplicateVersionId(modelKey)
          ) {
            // Model not in database but is a dynamic provider destination/version: use custom model cost as fallback
            requiredCredits = this.getCustomModelCost();
            this.loggerService.warn(
              'Credits guard: Model not found in database, using custom model cost fallback',
              {
                customCost: requiredCredits,
                isFalDestination: isFalDestination(modelKey),
                isReplicateDestination: isReplicateDestination(modelKey),
                isReplicateVersionId: isReplicateVersionId(modelKey),
                modelKey,
                normalized,
              },
            );
          } else {
            // Model not found and not a Replicate destination
            this.loggerService.error('Credits guard: Model not found', {
              modelKey,
              normalized,
              source: 'request body',
            });

            throw new InsufficientCreditsException(0, 0);
          }
        }
      } else if (creditsConfig.modelKey) {
        const normalized = baseModelKey(creditsConfig.modelKey);
        // If decorator provides the training model key (trainer), compute dynamically using steps
        if (isTrainerKey(normalized)) {
          requiredCredits = this.calculateTrainingCredits(body?.steps);
          this.loggerService.debug(
            'Credits guard: Training credits calculated',
            {
              modelKey: creditsConfig.modelKey,
              requiredCredits,
              steps: body?.steps || this.DEFAULT_TRAINING_STEPS,
            },
          );
        } else if (isTrainingKey(creditsConfig.modelKey)) {
          // Trained model (genfeedai/<id>): use custom model cost
          requiredCredits = this.getCustomModelCost();
          this.loggerService.debug(
            'Credits guard: Trained model detected via decorator, applying custom model cost',
            { modelKey: creditsConfig.modelKey, requiredCredits },
          );
        } else {
          // Try to find model in database first (for known models like Ideogram, Imagen, nano-banana-pro, etc.)
          const model = await this.modelsService.findOne({
            isDeleted: false,
            key: normalized,
          });

          if (model) {
            resolvedModel = model;
            // Model found in database - use database cost or dynamic pricing
            this.loggerService.debug(
              'Credits guard: Model found in database (decorator)',
              {
                cost: model.cost,
                costPerUnit: model.costPerUnit,
                databaseKey: model.key,
                label: model.label,
                minCost: model.minCost,
                modelKey: normalized,
                pricingType: model.pricingType,
              },
            );

            if (model.label?.toLowerCase().includes('training')) {
              requiredCredits = this.TRAINING_MODEL_FLAT_COST;
              this.loggerService.debug(
                'Credits guard: Training model label detected (decorator), flat credits applied',
                { label: model.label, modelKey: normalized, requiredCredits },
              );
            } else {
              // Use dynamic pricing calculation
              requiredCredits = this.calculateDynamicCost(
                model,
                width,
                height,
                duration,
              );
            }
          } else if (
            isFalDestination(creditsConfig.modelKey) ||
            isReplicateDestination(creditsConfig.modelKey) ||
            isReplicateVersionId(creditsConfig.modelKey)
          ) {
            // Model not in database but is a dynamic provider destination/version: use custom model cost as fallback
            requiredCredits = this.getCustomModelCost();
            this.loggerService.warn(
              'Credits guard: Model not found in database (decorator), using custom model cost fallback',
              {
                customCost: requiredCredits,
                isFalDestination: isFalDestination(creditsConfig.modelKey),
                isReplicateDestination: isReplicateDestination(
                  creditsConfig.modelKey,
                ),
                isReplicateVersionId: isReplicateVersionId(
                  creditsConfig.modelKey,
                ),
                modelKey: creditsConfig.modelKey,
                normalized,
              },
            );
          } else {
            // Model not found and not a Replicate destination
            this.loggerService.error('Credits guard: Model not found', {
              modelKey: creditsConfig.modelKey,
              normalized,
              source: 'decorator',
            });
            throw new InsufficientCreditsException(0, 0);
          }
        }
      } else if (
        rawBody?.autoSelectModel === true ||
        rawAttributes?.autoSelectModel === true
      ) {
        // Auto-select model: defer credit check to controller (model not yet resolved)
        this.loggerService.debug(
          'Credits guard: autoSelectModel detected, deferring credit check',
        );
        request.creditsConfig = { ...creditsConfig, amount: 0, deferred: true };
        return true;
      } else if (shouldDeferModelResolution) {
        this.loggerService.debug(
          'Credits guard: deferring credit check until controller resolves default model',
        );
        request.creditsConfig = { ...creditsConfig, amount: 0, deferred: true };
        return true;
      } else if (creditsConfig.amount !== undefined) {
        requiredCredits = creditsConfig.amount;
      } else {
        this.loggerService.error(
          'Credits guard: No model in body, modelKey in decorator, or amount specified',
        );
        throw new InsufficientCreditsException(0, 0);
      }

      // Multiply credits by resolution multiplier (high/1080p = 2x, standard/720p = 1x)
      // This applies to video generation models
      const resolution = body?.resolution;
      if (resolution === 'high' || resolution === '1080p') {
        requiredCredits *= 2;
        this.loggerService.debug(
          'Credits guard: credits multiplied for high resolution',
          {
            requiredCredits,
            resolution,
          },
        );
      }

      // Multiply credits by outputs for non-trained models (each output = separate API call)
      // Trained models use num_outputs in single API call, so no multiplication needed
      const keyForMultiplier = modelKey || creditsConfig.modelKey;
      if (keyForMultiplier && outputs > 1) {
        const shouldMultiply = !isTrainingKey(keyForMultiplier);

        if (shouldMultiply) {
          requiredCredits *= outputs;
          this.loggerService.debug(
            'Credits guard: credits multiplied for batch generation',
            {
              modelKey: keyForMultiplier,
              outputs,
              requiredCredits,
            },
          );
        } else {
          this.loggerService.debug(
            'Credits guard: trained model with num_outputs, no multiplication',
            {
              modelKey: keyForMultiplier,
              outputs,
              requiredCredits,
            },
          );
        }
      }

      if (!publicMetadata.organization) {
        this.loggerService.error(
          'Credits guard: No organization found for user',
          {
            publicMetadata,
            userId: user.id,
          },
        );
        throw new HttpException(
          {
            detail: 'User must belong to an organization to use this feature',
            title: 'Organization required',
          },
          HttpStatus.FORBIDDEN,
        );
      }

      if (!Number.isFinite(requiredCredits) || requiredCredits < 0) {
        this.loggerService.error('Credits guard: Invalid credits amount', {
          isFinite: Number.isFinite(requiredCredits),
          organizationId: publicMetadata.organization,
          requiredCredits,
          userId: user.id,
        });

        throw new HttpException(
          {
            detail: 'Credits requirement must be a valid positive number',
            title: 'Invalid credits amount',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // --- Per-provider BYOK bypass ---
      let byokProvider: ByokProvider | undefined = creditsConfig.provider;

      if (!byokProvider && resolvedModel?.provider) {
        // @ts-expect-error TS2345
        byokProvider = modelProviderToByokProvider(resolvedModel.provider);
      }

      // Fallback: resolve from modelKey prefix (covers HeyGen, KlingAI, LeonardoAI, etc.)
      if (!byokProvider) {
        const effectiveModelKey = modelKey || creditsConfig.modelKey;
        if (effectiveModelKey) {
          byokProvider = modelKeyToByokProvider(effectiveModelKey);
        }
      }

      if (byokProvider && publicMetadata.organization) {
        const isByokActive = await this.byokService.isByokActiveForProvider(
          publicMetadata.organization,
          byokProvider,
        );

        if (isByokActive) {
          // Check BYOK billing status — block if past_due or suspended
          const isBillingOk =
            await this.byokService.isByokBillingInGoodStanding(
              publicMetadata.organization,
            );

          if (!isBillingOk) {
            this.loggerService.warn(
              'Credits guard: BYOK billing not in good standing',
              {
                byokProvider,
                organizationId: publicMetadata.organization,
              },
            );

            throw new HttpException(
              {
                detail:
                  'BYOK access is suspended due to an unpaid platform fee invoice. Please update your payment method or purchase a credit pack.',
                title: 'BYOK billing past due',
              },
              HttpStatus.FORBIDDEN,
            );
          }

          this.loggerService.debug('Credits guard: BYOK bypass active', {
            byokProvider,
            organizationId: publicMetadata.organization,
            requiredCredits,
          });

          request.creditsConfig = {
            ...creditsConfig,
            amount: requiredCredits,
            isByokBypass: true,
            modelKey: modelKey || creditsConfig.modelKey,
          };
          return true;
        }
      }
      // --- End BYOK bypass ---

      const hasEnoughCredits =
        await this.creditsUtilsService.checkOrganizationCreditsAvailable(
          publicMetadata.organization,
          requiredCredits,
        );

      if (!hasEnoughCredits) {
        const currentBalance =
          await this.creditsUtilsService.getOrganizationCreditsBalance(
            publicMetadata.organization,
          );

        this.loggerService.warn('Credits guard: Insufficient credits', {
          available: currentBalance,
          modelKey: modelKey || creditsConfig.modelKey,
          organizationId: publicMetadata.organization,
          required: requiredCredits,
          userId: user.id,
        });

        throw new InsufficientCreditsException(requiredCredits, currentBalance);
      }

      // Store updated credits config in request for use in interceptor
      const updatedCreditsConfig = {
        ...creditsConfig,
        amount: requiredCredits,
        modelKey: modelKey || creditsConfig.modelKey, // Store the actual model key used
      };
      request.creditsConfig = updatedCreditsConfig;
      this.loggerService.debug('Credits guard: creditsConfig set on request', {
        amount: updatedCreditsConfig.amount,
        modelKey: updatedCreditsConfig.modelKey,
        outputs,
      });

      return true;
    } catch (error: unknown) {
      // If it's already an InsufficientCreditsException, re-throw it
      if (error instanceof InsufficientCreditsException) {
        throw error;
      }

      // For any other error, log it and throw an exception
      this.loggerService.error('Credits guard: Error checking credits', error);
      throw new InsufficientCreditsException(0, 0);
    }
  }

  /**
   * Calculate training credits based on number of steps
   * @param steps Number of training steps
   * @returns Required credits for training
   */
  private calculateTrainingCredits(steps?: number): number {
    const actualSteps = Number(steps) || this.DEFAULT_TRAINING_STEPS;
    const basePerThousand =
      Number(this.configService.get('TRAINING_TRAINING_CREDITS_COST')) ||
      this.TRAINING_CREDITS_PER_THOUSAND_STEPS;

    return Math.max(
      basePerThousand,
      Math.round((actualSteps / 1000) * basePerThousand),
    );
  }

  /**
   * Get the cost for custom models
   * @returns Custom model cost
   */
  private getCustomModelCost(): number {
    return (
      Number(this.configService.get('TRAINING_CUSTOM_MODEL_CREDITS_COST')) ||
      this.TRAINING_MODEL_FLAT_COST
    );
  }

  /**
   * Calculate dynamic cost based on model pricing type
   * @param model Model with pricing configuration
   * @param width Output width in pixels (for per-megapixel)
   * @param height Output height in pixels (for per-megapixel)
   * @param duration Output duration in seconds (for per-second)
   * @returns Calculated cost in credits
   */
  private calculateDynamicCost(
    model: {
      cost?: number;
      pricingType?: PricingType;
      costPerUnit?: number;
      minCost?: number;
    },
    width?: number,
    height?: number,
    duration?: number,
  ): number {
    const pricingType = model.pricingType || PricingType.FLAT;
    let baseCost = model.cost || 0;

    switch (pricingType) {
      case PricingType.PER_MEGAPIXEL: {
        if (width && height && model.costPerUnit) {
          const megapixels = (width * height) / 1_000_000;
          baseCost = Math.ceil(megapixels * model.costPerUnit);
          this.loggerService.debug(
            'Credits guard: Per-megapixel cost calculated',
            {
              calculatedCost: baseCost,
              costPerUnit: model.costPerUnit,
              height,
              megapixels: megapixels.toFixed(2),
              width,
            },
          );
        }
        break;
      }

      case PricingType.PER_SECOND: {
        if (duration && model.costPerUnit) {
          baseCost = Math.ceil(duration * model.costPerUnit);
          this.loggerService.debug(
            'Credits guard: Per-second cost calculated',
            {
              calculatedCost: baseCost,
              costPerUnit: model.costPerUnit,
              duration,
            },
          );
        }
        break;
      }

      case 'per-token':
        baseCost = getMinimumTextCredits(model);
        break;

      default:
        // Use model.cost as-is (already set)
        break;
    }

    // Apply minimum cost floor
    const minCost = model.minCost || 0;
    if (minCost > 0 && baseCost < minCost) {
      this.loggerService.debug('Credits guard: Minimum cost floor applied', {
        calculatedCost: baseCost,
        finalCost: minCost,
        minCost,
      });
      baseCost = minCost;
    }

    return baseCost;
  }
}
