import type {
  ImageGenerationContext,
  ImageGenerationSaveDocumentsResult,
  PreparedImageGenerationProvider,
} from '@api/collections/images/services/image-generation.types';
import { isGenerationCancelledError } from '@api/collections/ingredients/errors/generation-cancelled.error';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import type { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { assertProviderOfferAvailable } from '@api/collections/models/utils/assert-provider-offer-available.util';
import { mapProviderOfferInput } from '@api/collections/models/utils/provider-offer-input.util';
import type { DeferredCreditsRequest } from '@api/helpers/utils/credits/generation-credit-cost.util';
import { isRecord } from '@genfeedai/utils/data/extract.util';
import { ConflictException, HttpException } from '@nestjs/common';

type ModelQuote = NonNullable<
  NonNullable<DeferredCreditsRequest['creditsConfig']>['modelQuote']
>;
type RoutedDispatch = NonNullable<ModelQuote['routedDispatch']>;

export interface RoutedDispatchDependencies {
  metadataService: MetadataService;
  getActiveDocument: (
    context: ImageGenerationContext,
  ) =>
    | Pick<
        ImageGenerationSaveDocumentsResult,
        'ingredientData' | 'metadataData'
      >
    | undefined;
  prepareProvider: (
    context: ImageGenerationContext,
  ) => Promise<PreparedImageGenerationProvider | null>;
}

/** Pins the quoted provider offer onto the dispatch context. */
export async function applyRoutedDispatch(
  metadataService: MetadataService,
  context: ImageGenerationContext,
  quote: ModelQuote,
  routed: RoutedDispatch,
): Promise<void> {
  const registration = await assertProviderOfferAvailable(
    metadataService.prisma,
    routed.offerId,
    routed.provider,
    context.user.organizationId,
  );
  if (
    registration.reviewedProviderContractVersion !== quote.rateVersion ||
    registration.endpoint !== routed.endpoint
  )
    throw new ConflictException(
      'Provider contract changed. Request a fresh quote.',
    );
  context.routedDispatch = routed;
  context.modelEndpoint = routed.endpoint;
  context.modelProvider = routed.provider;
  context.modelInputSchema = isRecord(registration.providerInputSchema)
    ? registration.providerInputSchema
    : undefined;
  context.modelSchemaFamily = routed.schemaFamily ?? undefined;
  if (routed.executionModelKey !== context.model) {
    const input = mapProviderOfferInput(registration.providerInputSchema, {
      ...quote.quantities,
      providerInput: context.compiledDispatch ?? context.providerInput,
    });
    if (!input)
      throw new ConflictException(
        'Provider input is incompatible with this quote.',
      );
    context.routedInput = input;
  }
}

/** Wraps `generate` so a failed primary offer retries on the quoted fallback. */
export function installRoutedFallback(
  dependencies: RoutedDispatchDependencies,
  context: ImageGenerationContext,
  provider: PreparedImageGenerationProvider,
  quote: ModelQuote,
  routed: RoutedDispatch,
  fallback: NonNullable<RoutedDispatch['fallback']>,
): void {
  const { metadataService } = dependencies;
  const initialGenerate = provider.generate.bind(provider);
  const originalInput = context.compiledDispatch ?? context.providerInput;
  provider.generate = async () => {
    context.modelProvider = routed.provider;
    context.routedDispatch = routed;
    const initialTarget = dependencies.getActiveDocument(context) ?? context;
    await metadataService.patch(
      initialTarget.metadataData.id,
      new MetadataEntity({ externalProvider: routed.provider }),
    );
    try {
      return await initialGenerate();
    } catch (error: unknown) {
      if (
        context.abortSignal?.aborted ||
        isGenerationCancelledError(error) ||
        (error instanceof HttpException && error.getStatus() < 500)
      )
        throw error;
      const registration = await assertProviderOfferAvailable(
        metadataService.prisma,
        fallback.offerId,
        fallback.provider,
        context.user.organizationId,
      );
      if (
        registration.reviewedProviderContractVersion !== fallback.rateVersion ||
        registration.endpoint !== fallback.endpoint
      )
        throw new ConflictException('Fallback provider contract changed.');
      const input =
        fallback.executionModelKey === context.model
          ? originalInput
          : mapProviderOfferInput(registration.providerInputSchema, {
              ...quote.quantities,
              providerInput: originalInput,
            });
      if (!input) throw error;
      context.routedDispatch = fallback;
      context.routedInput = input;
      context.modelProvider = fallback.provider;
      context.modelEndpoint = fallback.endpoint;
      context.modelInputSchema = isRecord(registration.providerInputSchema)
        ? registration.providerInputSchema
        : undefined;
      context.modelSchemaFamily = fallback.schemaFamily ?? undefined;
      const target = dependencies.getActiveDocument(context) ?? context;
      await metadataService.patch(
        target.metadataData.id,
        new MetadataEntity({ externalProvider: fallback.provider }),
      );
      const alternate = await dependencies.prepareProvider(context);
      if (!alternate || alternate.completionKind === 'none') throw error;
      return alternate.generate();
    }
  };
}
