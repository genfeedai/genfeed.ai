import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import { ModelsService } from '@api/collections/models/services/models.service';
import {
  baseModelKey,
  isFalDestination,
  isReplicateDestination,
  isReplicateVersionId,
  isTrainerKey,
  isTrainingKey,
} from '@api/collections/models/utils/model-key.util';
import {
  BusinessLogicException,
  InsufficientCreditsException,
} from '@api/exceptions/business-logic.exception';
import {
  CREDITS_DEFER_MODEL_RESOLUTION_KEY,
  CREDITS_KEY,
} from '@api/helpers/decorators/credits/credits.decorator';
import {
  hasGenerationSourceActionId,
  type ReservationCreditsConfig,
  reserveGenerationRequestCredits,
} from '@api/helpers/utils/credits/generation-credit-reservation.util';
import { getMinimumTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { ByokService } from '@api/services/byok/byok.service';
import { resolveModelByokProvider } from '@api/services/byok/byok-provider-map.util';
import {
  ActivitySource,
  type ByokProvider,
  PricingType,
} from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type { CreditsConfig } from '@genfeedai/contracts/interfaces';
import { getDeserializer, isDeserializerRuntime } from '@genfeedai/helpers';
import {
  billCreditsFromProviderCost,
  buildPricingAuditStamp,
  getVideoGenerationResolutionCreditMultiplier,
  isTopazVideoUpscaleFps,
  isTopazVideoUpscaleResolution,
  quoteTopazVideoUpscaleCredits,
} from '@genfeedai/pricing';
import { ConfigService } from '@libs/config/config.service';
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
export interface CreditsGuardRequest extends Omit<Request, 'user'> {
  user?: AuthenticatedUser;
  creditsConfig?: ReservationCreditsConfig & {
    amount: number;
    modelKey?: string;
    deferred?: boolean;
  };
  creditsOutputCount?: number;
}

// DTO for credits body validation
interface CreditsRequestBody {
  model?: string;
  outputs?: number;
  steps?: number;
  resolution?: string;
  targetFps?: number;
  targetResolution?: string;
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

    return this.admit(
      context.switchToHttp().getRequest<CreditsGuardRequest>(),
      creditsConfig,
      shouldDeferModelResolution,
    );
  }

  /**
   * Explicit-input credits admission. The HTTP adapter above resolves the
   * decorator metadata; the in-process agent generation gateway passes the same
   * inputs directly so both share one enforcement path.
   */
  async admit(
    request: CreditsGuardRequest,
    creditsConfig: CreditsConfig | undefined,
    shouldDeferModelResolution = false,
  ): Promise<boolean> {
    this.loggerService.debug('Credits guard: metadata check', {
      hasCreditsConfig: !!creditsConfig,
      shouldDeferModelResolution,
    });

    if (!creditsConfig) {
      return true; // No credits required for this endpoint
    }

    const user = request.user;

    if (!user) {
      this.loggerService.warn('Credits guard: No user found in request');
      throw new InsufficientCreditsException(0, 0);
    }

    try {
      let requiredCredits: number;
      let creditsDeferred = false;

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
      outputs =
        request.creditsOutputCount ??
        (Number(rawAttributes?.outputs ?? rawBody?.outputs) || 1);

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
        const deserializedBody = await getDeserializer<CreditsRequestBody>(
          request.body,
        );
        body = isDeserializerRuntime(deserializedBody)
          ? (request.body as CreditsRequestBody)
          : deserializedBody;

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
          request.creditsOutputCount ??
          (Number(body?.outputs ?? attributes?.outputs ?? outputs) || outputs);

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
      let resolvedModel: ModelDocument | null = null;

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
          // Resolve the database row before classifying slash-shaped keys as
          // provider destinations. Known provider models (for example
          // bytedance/seedance) carry live providerCostUsd pricing; only an
          // unknown destination should use the custom-model fallback.
          const model = await this.modelsService.findOne({
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
              providerCostUsd: model.providerCostUsd,
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
        creditsDeferred = true;
        requiredCredits = 0;
      } else if (shouldDeferModelResolution) {
        this.loggerService.debug(
          'Credits guard: deferring credit check until controller resolves default model',
        );
        request.creditsConfig = { ...creditsConfig, amount: 0, deferred: true };
        creditsDeferred = true;
        requiredCredits = 0;
      } else if (creditsConfig.amount !== undefined) {
        requiredCredits = creditsConfig.amount;
      } else {
        this.loggerService.error(
          'Credits guard: No model in body, modelKey in decorator, or amount specified',
        );
        throw new InsufficientCreditsException(0, 0);
      }

      // Video generation uses model-aware bands (including 4K); other legacy
      // generation routes retain their historical high/1080p multiplier.
      const resolution = body?.resolution;
      if (creditsConfig.source === ActivitySource.VIDEO_GENERATION) {
        requiredCredits *= getVideoGenerationResolutionCreditMultiplier(
          modelKey || creditsConfig.modelKey || '',
          resolution,
        );
      } else if (resolution === 'high' || resolution === '1080p') {
        requiredCredits *= 2;
      }
      if (
        resolution &&
        getVideoGenerationResolutionCreditMultiplier(
          modelKey || creditsConfig.modelKey || '',
          resolution,
        ) !== 1
      ) {
        this.loggerService.debug(
          'Credits guard: credits multiplied for selected resolution',
          {
            requiredCredits,
            resolution,
          },
        );
      }

      const effectiveModelKey = baseModelKey(
        modelKey || creditsConfig.modelKey || '',
      );
      const targetResolution = body?.targetResolution;
      const targetFps = body?.targetFps;
      if (
        effectiveModelKey === MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE &&
        isTopazVideoUpscaleResolution(targetResolution) &&
        isTopazVideoUpscaleFps(targetFps)
      ) {
        requiredCredits = quoteTopazVideoUpscaleCredits(
          requiredCredits,
          targetResolution,
          targetFps,
        );
      }

      // Multiply credits by outputs for non-trained models (each output = separate API call)
      // Trained models use num_outputs in single API call, so no multiplication needed
      const keyForMultiplier = modelKey || creditsConfig.modelKey;
      if (outputs > 1) {
        const shouldMultiply =
          !keyForMultiplier || !isTrainingKey(keyForMultiplier);

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

      if (!user.organizationId) {
        this.loggerService.error(
          'Credits guard: No organization found for user',
          {
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
          organizationId: user.organizationId,
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

      if (!byokProvider) {
        const effectiveModelKey = modelKey || creditsConfig.modelKey;
        byokProvider = resolveModelByokProvider(
          effectiveModelKey,
          resolvedModel?.provider,
        );
      }

      if (byokProvider && user.organizationId) {
        const isByokActive = await this.byokService.isByokActiveForProvider(
          user.organizationId,
          byokProvider,
        );

        if (isByokActive) {
          // Check BYOK billing status — block if past_due or suspended
          const isBillingOk =
            await this.byokService.isByokBillingInGoodStanding(
              user.organizationId,
            );

          if (!isBillingOk) {
            this.loggerService.warn(
              'Credits guard: BYOK billing not in good standing',
              {
                byokProvider,
                organizationId: user.organizationId,
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
            organizationId: user.organizationId,
            requiredCredits,
          });

          request.creditsConfig = {
            ...creditsConfig,
            amount: requiredCredits,
            ...(creditsDeferred ? { deferred: true } : {}),
            isByokBypass: true,
            modelKey: modelKey || creditsConfig.modelKey,
            provider: byokProvider,
          };
          return true;
        }
      }
      // --- End BYOK bypass ---

      if (creditsDeferred) return true;

      const hasEnoughCredits =
        hasGenerationSourceActionId(request) ||
        (await this.creditsUtilsService.checkOrganizationCreditsAvailable(
          user.organizationId,
          requiredCredits,
        ));

      if (!hasEnoughCredits) {
        const currentBalance =
          await this.creditsUtilsService.getOrganizationCreditsBalance(
            user.organizationId,
          );

        this.loggerService.warn('Credits guard: Insufficient credits', {
          available: currentBalance,
          modelKey: modelKey || creditsConfig.modelKey,
          organizationId: user.organizationId,
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
        ...(resolvedModel
          ? { pricingMetadata: buildPricingAuditStamp(resolvedModel) }
          : {}),
      };
      request.creditsConfig = updatedCreditsConfig;
      try {
        await reserveGenerationRequestCredits({
          amount: requiredCredits,
          creditsUtilsService: this.creditsUtilsService,
          organizationId: user.organizationId,
          request,
        });
      } catch (error: unknown) {
        if (
          error instanceof BusinessLogicException &&
          error.errorCode === 'INSUFFICIENT_CREDITS'
        ) {
          const currentBalance =
            await this.creditsUtilsService.getOrganizationCreditsBalance(
              user.organizationId,
            );
          throw new InsufficientCreditsException(
            requiredCredits,
            currentBalance,
          );
        }
        throw error;
      }
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
   * Resolve credits for a generation.
   *
   * Preferred: shared `billCreditsFromProviderCost` (provider USD × units ×
   * live admin margin). Same helper projects virtual `cost`/`costPerUnit` on
   * model reads via ModelsService.normalizeModelDocument.
   *
   * Fallback: legacy baked `cost` / `costPerUnit` when providerCostUsd is null.
   */
  private calculateDynamicCost(
    model: {
      cost?: number | null;
      costPerUnit?: number | null;
      defaultDuration?: number | null;
      minCost?: number | null;
      pricingType?: string | null;
      providerCostUsd?: number | null;
    },
    width?: number,
    height?: number,
    duration?: number,
  ): number {
    const liveCredits = billCreditsFromProviderCost(model, {
      duration,
      height,
      width,
    });
    if (liveCredits !== null) {
      this.loggerService.debug(
        'Credits guard: providerCostUsd × applyMargin (live margin)',
        {
          credits: liveCredits,
          duration,
          pricingType: model.pricingType,
          providerCostUsd: model.providerCostUsd,
        },
      );
      return liveCredits;
    }

    const pricingType = model.pricingType || PricingType.FLAT;
    let baseCost = model.cost || 0;

    switch (pricingType) {
      case PricingType.PER_MEGAPIXEL: {
        if (width && height && model.costPerUnit) {
          const megapixels = (width * height) / 1_000_000;
          baseCost = Math.ceil(megapixels * model.costPerUnit);
          this.loggerService.debug(
            'Credits guard: Per-megapixel cost calculated (legacy costPerUnit)',
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
            'Credits guard: Per-second cost calculated (legacy costPerUnit)',
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

    // Apply minimum cost floor (legacy baked credits only)
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
