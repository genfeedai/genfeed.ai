import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { isNativeImageBatch } from '@api/collections/images/services/image-generation-provider.util';
import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import { DefaultGenerationAffordabilityService } from '@api/collections/models/services/default-generation-affordability.service';
import { ModelCreditQuoteService } from '@api/collections/models/services/model-credit-quote.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import {
  baseModelKey,
  isFalDestination,
  isReplicateDestination,
  isReplicateVersionId,
  isTrainerKey,
  isTrainingKey,
} from '@api/collections/models/utils/model-key.util';
import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
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
import {
  getIsSuperAdmin,
  getStripeSubscriptionStatus,
} from '@api/helpers/utils/auth/auth.util';
import { getMinimumTextCredits } from '@api/helpers/utils/text-pricing/text-pricing.util';
import { ByokService } from '@api/services/byok/byok.service';
import { resolveModelByokProvider } from '@api/services/byok/byok-provider-map.util';
import {
  ActivitySource,
  type ByokProvider,
  SubscriptionStatus,
} from '@genfeedai/contracts';
import {
  MODEL_KEYS,
  MODEL_OUTPUT_CAPABILITIES,
  normalizeMusicSettings,
} from '@genfeedai/contracts/constants';
import type {
  CreditsConfig,
  ModelBillableQuoteSnapshot,
} from '@genfeedai/contracts/interfaces';
import { getDeserializer, isDeserializerRuntime } from '@genfeedai/helpers';
import {
  buildPricingAuditStamp,
  getVideoGenerationResolutionCreditMultiplier,
  isTopazVideoUpscaleFps,
  isTopazVideoUpscaleResolution,
  quoteTopazVideoUpscaleCredits,
} from '@genfeedai/pricing';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Optional,
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
  private readonly DEFAULT_TRAINING_STEPS = 1000;

  constructor(
    private readonly platformSettingsService: PlatformSettingsService,
    private reflector: Reflector,

    private creditsUtilsService: CreditsUtilsService,
    private modelsService: ModelsService,
    private byokService: ByokService,

    private loggerService: LoggerService,
    private readonly modelCreditQuote: ModelCreditQuoteService,
    @Optional()
    private readonly defaultGenerationAffordability?: DefaultGenerationAffordabilityService,
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
      let modelQuote: ModelBillableQuoteSnapshot | undefined;

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

      if (creditsConfig.isBodyModelIgnored) {
        modelKey = undefined;
      }

      // Hoisted model reference for BYOK provider resolution
      let resolvedModel: ModelDocument | null = null;
      const deserializedBody = body as Record<string, unknown> | null;
      const skipWhenBodyAttribute = creditsConfig.skipWhenBodyAttribute;
      const shouldSkipCredits = Boolean(
        skipWhenBodyAttribute &&
          (deserializedBody?.[skipWhenBodyAttribute] === true ||
            rawBody?.[skipWhenBodyAttribute] === true ||
            rawAttributes?.[skipWhenBodyAttribute] === true),
      );

      const pricingModelKey = modelKey || creditsConfig.modelKey;
      const pricingDuration =
        creditsConfig.source === ActivitySource.MUSIC_GENERATION &&
        pricingModelKey
          ? normalizeMusicSettings(baseModelKey(pricingModelKey), {
              duration: duration || undefined,
            }).duration
          : duration;
      const modelSource = modelKey ? 'request body' : 'decorator';

      // Determine credits required: from model in body, modelKey in decorator, or fixed amount
      if (shouldSkipCredits) {
        requiredCredits = 0;
      } else if (shouldDeferModelResolution) {
        requiredCredits = 0;
        creditsDeferred = true;
        request.creditsConfig = { ...creditsConfig, amount: 0, deferred: true };
        if (pricingModelKey && creditsConfig.allowByokBypass) {
          resolvedModel = await this.modelsService.findOne({
            key: pricingModelKey,
          });
        }
      } else if (pricingModelKey) {
        const modelKey = pricingModelKey;
        const normalized = baseModelKey(modelKey);
        // Special handling for Replicate training model (trainer): credits scale with steps
        if (isTrainerKey(normalized)) {
          requiredCredits = await this.calculateTrainingCredits(body?.steps);
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
          if (modelSource === 'request body') {
            request.creditsConfig = updatedCreditsConfig;
          }
          // Continue to balance check below
        } else if (isTrainingKey(modelKey)) {
          // Trained model (genfeedai/<id>): use custom model cost
          requiredCredits = await this.getCustomModelCost();
          this.loggerService.debug(
            'Credits guard: Trained model detected, applying custom model cost',
            { modelKey, requiredCredits },
          );

          const updatedCreditsConfig = {
            ...creditsConfig,
            amount: requiredCredits,
            modelKey,
          };
          if (modelSource === 'request body') {
            request.creditsConfig = updatedCreditsConfig;
          }
        } else {
          // Resolve the database row before classifying slash-shaped keys as
          // provider destinations. Known provider models (for example
          // bytedance/seedance) carry live providerCostUsd pricing; only an
          // unknown destination should use the custom-model fallback.
          const model = await this.modelsService.findOne({
            key: modelKey,
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
              requiredCredits = await this.getCustomModelCost();
              this.loggerService.debug(
                'Credits guard: Training model label detected, flat credits applied',
                { label: model.label, modelKey: normalized, requiredCredits },
              );
            } else if (model.pricingType === 'per-token') {
              // LLM admission remains a minimum; settlement bills the answering model's actual tokens.
              requiredCredits = getMinimumTextCredits(model);
            } else {
              // Use exact generation tariff quantities
              modelQuote = await this.modelCreditQuote.quoteSnapshotByKey(
                modelKey,
                {
                  organizationId: user.organizationId,
                  provider: model.provider,
                  duration: pricingDuration || undefined,
                  height: height || undefined,
                  width: width || undefined,
                  outputs,
                  requests: (
                    creditsConfig.source === ActivitySource.IMAGE_GENERATION
                      ? isNativeImageBatch(modelKey, model.provider)
                      : MODEL_OUTPUT_CAPABILITIES[modelKey]?.isBatchSupported
                  )
                    ? 1
                    : outputs,
                  selectors: this.readSelectedPricingDimensions(body),
                },
              );
              requiredCredits = modelQuote.credits;
            }
          } else if (
            isFalDestination(modelKey) ||
            isReplicateDestination(modelKey) ||
            isReplicateVersionId(modelKey)
          ) {
            if (creditsConfig.settlement === 'completion') {
              await this.modelCreditQuote.quoteSnapshotByKey(modelKey, {
                organizationId: user.organizationId,
              });
            }
            // Legacy non-media custom/training tariffs retain their separate contract.
            requiredCredits = await this.getCustomModelCost();
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
              source: modelSource,
            });

            throw new BadRequestException(`Unknown model: ${modelKey}`);
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
      if (
        !creditsDeferred &&
        !modelQuote &&
        creditsConfig.source === ActivitySource.VIDEO_GENERATION
      ) {
        requiredCredits *= getVideoGenerationResolutionCreditMultiplier(
          modelKey || creditsConfig.modelKey || '',
          resolution,
        );
      } else if (
        !creditsDeferred &&
        !modelQuote &&
        (resolution === 'high' || resolution === '1080p')
      ) {
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
        !creditsDeferred &&
        !modelQuote &&
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
      if (!creditsDeferred && !modelQuote && outputs > 1) {
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

      if (shouldSkipCredits) {
        request.creditsConfig = { ...creditsConfig, amount: 0 };
        return true;
      }

      // --- Per-provider BYOK bypass ---
      // #5294 billing fails safe: a bypass is only allowed where the route
      // has explicitly opted in with `allowByokBypass`, set only on routes
      // verified to thread the org's key into their provider call. Every
      // other route — including every new `@Credits({ modelKey })` route
      // that never opts in — never resolves a provider here and falls
      // through to the normal credit charge below, even when the org has an
      // active key for the model's provider.
      let byokProvider: ByokProvider | undefined;

      if (creditsConfig.allowByokBypass) {
        byokProvider =
          creditsConfig.provider ??
          resolveModelByokProvider(
            modelKey || creditsConfig.modelKey,
            resolvedModel?.provider,
          );
      }

      if (byokProvider && user.organizationId) {
        // Resolve the org's decrypted key exactly once (#5375): the
        // returned key is both the bypass decision (defined/undefined) and
        // the value dispatch must use, so the credit charge and the
        // provider call can never disagree about whose key paid.
        const resolvedByokKey = await this.byokService.resolveApiKey(
          user.organizationId,
          byokProvider,
        );

        if (resolvedByokKey) {
          this.loggerService.debug('Credits guard: BYOK bypass active', {
            byokProvider,
            organizationId: user.organizationId,
            requiredCredits,
          });

          request.creditsConfig = {
            ...creditsConfig,
            amount: requiredCredits,
            ...(creditsDeferred ? { deferred: true } : {}),
            byokApiKeyOverride: resolvedByokKey.apiKey,
            isByokBypass: true,
            modelKey: modelKey || creditsConfig.modelKey,
            provider: byokProvider,
          };
          return true;
        }
      }
      // --- End BYOK bypass ---

      // Trial used up: the wallet cannot pay for one default image, so even a
      // cheaper action waits for a credit pack or a plan.
      if (
        requiredCredits > 0 &&
        !hasGenerationSourceActionId(request) &&
        this.defaultGenerationAffordability
      ) {
        const subscriptionStatus = getStripeSubscriptionStatus(user, request);
        await this.defaultGenerationAffordability.assertTrialAllowsSpend({
          hasPaidPlan:
            subscriptionStatus === SubscriptionStatus.ACTIVE ||
            subscriptionStatus === SubscriptionStatus.TRIALING,
          isSuperAdmin: getIsSuperAdmin(user, request),
          organizationId: user.organizationId,
          readBalance: () =>
            this.creditsUtilsService.getOrganizationCreditsBalance(
              user.organizationId,
            ),
          userId: user.userId || user.id,
        });
      }

      if (creditsDeferred) return true;

      // A zero-cost request is never refused, and never depends on the
      // wallet lookup succeeding.
      const hasEnoughCredits =
        requiredCredits === 0 ||
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
        ...(modelQuote ? { modelQuote } : {}),
        ...(resolvedModel
          ? { pricingMetadata: buildPricingAuditStamp(resolvedModel) }
          : {}),
      };
      request.creditsConfig = updatedCreditsConfig;
      if (creditsConfig.isReservationDeferred) return true;
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
      // HTTP errors (insufficient credits, organization required, BYOK billing,
      // unknown model) already carry their own status and reason. Anything else
      // is a real failure: surface it rather than reporting it as
      // "Insufficient credits: 0 required, 0 available".
      if (!(error instanceof HttpException)) {
        this.loggerService.error(
          'Credits guard: Error checking credits',
          error,
        );
      }
      throw error;
    }
  }

  private readSelectedPricingDimensions(
    body: CreditsRequestBody | null,
  ): Record<string, string | number | boolean> | undefined {
    const selected: Record<string, string | number | boolean> = {};
    for (const key of [
      'resolution',
      'quality',
      'mode',
      'generate_audio',
      'audio',
      'fps',
    ]) {
      const value = body?.[key];
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      )
        selected[key] = value;
    }
    return Object.keys(selected).length ? selected : undefined;
  }

  /**
   * Calculate training credits based on number of steps
   * @param steps Number of training steps
   * @returns Required credits for training
   */
  private async calculateTrainingCredits(steps?: number): Promise<number> {
    const actualSteps = Number(steps) || this.DEFAULT_TRAINING_STEPS;
    const basePerThousand = (
      await this.platformSettingsService.getFeatureSettings()
    ).trainingCreditsCost;

    return Math.max(
      basePerThousand,
      Math.round((actualSteps / 1000) * basePerThousand),
    );
  }

  /**
   * Get the cost for custom models
   * @returns Custom model cost
   */
  private async getCustomModelCost(): Promise<number> {
    return (await this.platformSettingsService.getFeatureSettings())
      .customModelCreditsCost;
  }
}
