import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type {
  GenerationBillingRequest,
  GenerationBillingService,
} from '@api/collections/credits/services/generation-billing.service';
import type { ImagesService } from '@api/collections/images/services/images.service';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { MetadataEntity } from '@api/collections/metadata/entities/metadata.entity';
import type { MetadataService } from '@api/collections/metadata/services/metadata.service';
import type { RequestWithSelectedModel } from '@api/helpers/guards/models/request-with-selected-model.interface';
import type { FailedGenerationService } from '@api/shared/services/failed-generation/failed-generation.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { getUserRoomName } from '@libs/websockets/room-name.util';

export interface ImageTransformationDispatchDeps {
  failedGenerationService: FailedGenerationService;
  generationBilling: GenerationBillingService;
  imagesService: ImagesService;
  loggerService: LoggerService;
  metadataService: MetadataService;
}

export interface ImageTransformationDispatch<TInput> {
  /** Builds the provider input. A failure here fails the output. */
  buildInput: () => Promise<TInput>;
  ingredientData: IngredientDocument;
  /** Prefix of the failure log line. */
  logUrl: string;
  metadataId: string;
  /** Extra fields saved on the metadata with the provider's external id. */
  metadataFields?: Pick<MetadataEntity, 'promptId'>;
  request: RequestWithSelectedModel;
  /** Submits the input; returns the provider's external id, if it accepted. */
  run: (input: TInput) => Promise<string | null | undefined>;
  user: User;
  websocketUrl: string;
}

/**
 * Dispatch an image transformation (upscale, reframe) whose output row is
 * already saved, and settle its credits.
 *
 * The request's credits are bound to the output before the provider is
 * called. When the provider accepts nothing, or anything fails before it
 * accepts, the reservation is released and the output is marked failed. Once
 * it accepts, the output stays funded: a later failure to save the external id
 * queues accepted-output recovery instead.
 */
export async function dispatchImageTransformation<TInput>(
  deps: ImageTransformationDispatchDeps,
  dispatch: ImageTransformationDispatch<TInput>,
): Promise<void> {
  const {
    failedGenerationService,
    generationBilling,
    imagesService,
    loggerService,
    metadataService,
  } = deps;
  const { ingredientData, request, user, websocketUrl } = dispatch;
  const ingredientId = String(ingredientData.id);

  const failOutput = async (errorMessage?: string): Promise<void> => {
    await generationBilling.releaseOutput(ingredientId, user.organizationId);
    await failedGenerationService.handleFailedImageGeneration(
      imagesService,
      ingredientData.id,
      websocketUrl,
      user,
      getUserRoomName(user.id),
      ...(errorMessage === undefined ? [] : [errorMessage]),
    );
  };

  let acceptedExternalId: string | undefined;
  try {
    const input = await dispatch.buildInput();

    const billingRequest = request as unknown as GenerationBillingRequest;
    const credits = billingRequest.creditsConfig?.amount;
    if (credits !== undefined) {
      await generationBilling.bindOutput(billingRequest, {
        credits,
        ingredientId,
      });
    }

    const generationId = await dispatch.run(input);

    if (!generationId) {
      await failOutput();
      return;
    }

    acceptedExternalId = generationId;
    await metadataService.patch(
      dispatch.metadataId,
      new MetadataEntity({
        externalId: generationId,
        ...dispatch.metadataFields,
      }),
    );
  } catch (error: unknown) {
    if (!acceptedExternalId) {
      loggerService.error(`${dispatch.logUrl} failed`, error);
      await failOutput(getErrorMessage(error));
      return;
    }

    loggerService.error(
      'Accepted transformation metadata persistence failed',
      error,
    );
    try {
      await generationBilling.rememberAcceptedOutput({
        ingredientId,
        externalId: acceptedExternalId,
        organizationId: user.organizationId,
        userId: user.userId,
      });
    } catch (recoveryError: unknown) {
      loggerService.error(
        'Accepted transformation recovery failed; retain its funding',
        recoveryError,
        { ingredientId, externalId: acceptedExternalId },
      );
    }
  }
}
