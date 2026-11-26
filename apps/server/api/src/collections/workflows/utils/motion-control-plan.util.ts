import type { WorkflowEngineExecutorHelperService } from '@api/collections/workflows/services/workflow-engine-executor-helper.service';
import type {
  WorkflowMediaProviderPlanInput,
  WorkflowMotionControlProviderPlan,
} from '@api/collections/workflows/services/workflow-media-provider-plan.interface';
import {
  bindMotionControlReference,
  type MotionControlOrientation,
  measureMotionControlReference,
} from '@api/collections/workflows/utils/motion-control-reference.util';
import {
  readStrings,
  replaceReferenceTokens,
} from '@api/collections/workflows/utils/workflow-media-plan-values.util';
import { ValidationException } from '@api/exceptions/validation.exception';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import {
  runVideoGenerationBrief,
  toRedactedVideoGenerationBriefProviderData,
} from '@api/services/generation-brief';
import { resolvePredictionTarget } from '@api/services/integrations/replicate/helpers/replicate-prediction-target.util';
import { IngredientCategory, MetadataExtension } from '@genfeedai/contracts';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { traced } from '@libs/tracing/traced';

const DEFAULT_OBJECTIVE =
  'Animate the character from the reference image with the movement of the reference video.';
const IMAGE_CATEGORIES: readonly IngredientCategory[] = [
  IngredientCategory.IMAGE,
  IngredientCategory.AVATAR,
];

interface MotionControlOptions {
  characterOrientation: MotionControlOrientation;
  keepOriginalSound: boolean;
  qualityMode: 'pro' | 'std';
}

export interface MotionControlPlanDependencies {
  admitCharacters(args: {
    brandId: string;
    organizationId: string;
    values: readonly unknown[];
  }): Promise<{ personaId?: string | null }>;
  files(): Pick<
    FilesClientService,
    | 'fingerprintMedia'
    | 'getPresignedDownloadUrlForObjectKey'
    | 'probeMediaFromUrl'
  >;
  helper: WorkflowEngineExecutorHelperService;
}

/** Every option is checked before any asset is read, with the field to fix. */
function readOptions(
  model: string,
  params: Record<string, unknown>,
): MotionControlOptions {
  if (model !== MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_MOTION_CONTROL)
    throw new ValidationException(
      `Motion control runs on ${MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_MOTION_CONTROL}. Choose that model.`,
      'model',
      model,
    );
  const quality = params.qualityMode ?? 'pro';
  if (quality !== 'std' && quality !== 'pro')
    throw new ValidationException(
      'Quality must be std (720p) or pro (1080p).',
      'qualityMode',
      quality,
    );
  const orientation = params.characterOrientation ?? 'image';
  if (orientation !== 'image' && orientation !== 'video')
    throw new ValidationException(
      'Character orientation must be image or video.',
      'characterOrientation',
      orientation,
    );
  const keepOriginalSound = params.keepOriginalSound ?? true;
  if (typeof keepOriginalSound !== 'boolean')
    throw new ValidationException(
      'Keep original sound must be true or false.',
      'keepOriginalSound',
      keepOriginalSound,
    );
  return {
    characterOrientation: orientation,
    keepOriginalSound,
    qualityMode: quality,
  };
}

/** A stored Library asset of this organization and brand, or a field-level refusal. */
async function requireAsset(
  helper: WorkflowEngineExecutorHelperService,
  value: unknown,
  field: 'image' | 'video',
  categories: readonly IngredientCategory[],
  scope: { brandId: string; organizationId: string },
) {
  if (value === undefined || value === null || value === '')
    throw new ValidationException(
      field === 'image'
        ? 'Connect the character image.'
        : 'Connect the motion reference video.',
      field,
    );
  let asset: Awaited<ReturnType<typeof helper.requireMediaAsset>>;
  try {
    asset = await helper.requireMediaAsset(
      value,
      scope.organizationId,
      categories,
    );
  } catch {
    throw new ValidationException(
      field === 'image'
        ? 'Choose a finished image from this workspace Library.'
        : 'Choose a finished video from this workspace Library.',
      field,
    );
  }
  if (asset.brandId !== scope.brandId)
    throw new ValidationException(
      `The ${field} belongs to another brand. Choose one from the brand this workflow runs for.`,
      field,
    );
  return asset;
}

/**
 * Image plus reference video on Kling v3 motion control. Options and both
 * sources are admitted, and the reference is measured, before any output or
 * provider dispatch exists, so a bad run fails without consuming credits.
 */
export const planMotionControl = traced(
  'planMotionControl',
  async (
    deps: MotionControlPlanDependencies,
    { model, params, context }: WorkflowMediaProviderPlanInput,
  ): Promise<WorkflowMotionControlProviderPlan> => {
    const { helper } = deps;
    const options = readOptions(model, params);
    const brandId = helper.requireBrandId(params.brandId, 'motionControl');
    const [imageValue] = readStrings(params.references);
    const [videoValue] = readStrings(params.videoReferences);
    const scope = { brandId, organizationId: context.organizationId };
    const image = await requireAsset(
      helper,
      imageValue,
      'image',
      IMAGE_CATEGORIES,
      scope,
    );
    const video = await requireAsset(
      helper,
      videoValue,
      'video',
      [IngredientCategory.VIDEO],
      scope,
    );
    if (!video.objectKey)
      throw new ValidationException(
        'The motion reference video has no stored file. Choose another video.',
        'video',
      );
    const { personaId } = await deps.admitCharacters({
      brandId,
      organizationId: context.organizationId,
      values: [imageValue],
    });
    const referenceQuoteEvidence = bindMotionControlReference({
      evidence: await measureMotionControlReference(deps.files(), {
        assetId: video.id,
        organizationId: context.organizationId,
        sourceKey: video.objectKey,
      }),
      modelKey: model,
      orientation: options.characterOrientation,
      organizationId: context.organizationId,
    });
    const prompt = typeof params.prompt === 'string' ? params.prompt : '';
    const compiled = runVideoGenerationBrief({
      actionVerb: 'reference_video',
      // No canvas: the output follows the reference, so no aspect ratio is sent.
      height: 0,
      model,
      objective: prompt.trim() || DEFAULT_OBJECTIVE,
      referenceIds: [],
      references: [{ assetId: image.id, role: 'first_frame' }],
      resolution: options.qualityMode,
      surface: 'workflow',
      videoReferenceIds: [video.id],
      width: 0,
    });
    if (!compiled.dispatch || compiled.evidence.status !== 'compiled')
      throw new Error(
        'Workflow motion control requires its compiled generation brief',
      );
    const dispatch = replaceReferenceTokens(
      compiled.dispatch,
      new Map([
        [image.id, helper.buildMediaIngredientUrl(image.id, image.category)],
        [video.id, helper.buildVideoIngredientUrl(video.id)],
      ]),
    ) as Record<string, unknown>;
    return {
      actionId: 'motionControl',
      generationBriefEvidence: compiled.evidence,
      generationSource: compiled.generationSource,
      input: {
        ...dispatch,
        character_orientation: options.characterOrientation,
        keep_original_sound: options.keepOriginalSound,
      },
      model,
      output: {
        brandId,
        category: IngredientCategory.VIDEO,
        extension: MetadataExtension.MP4,
        externalId: null,
        generationPrompt: prompt,
        generationSource: compiled.generationSource,
        model,
        organizationId: context.organizationId,
        personaId,
        providerData: toRedactedVideoGenerationBriefProviderData(
          compiled.evidence,
        ),
        references: [image.id, video.id],
        userId: context.userId,
      },
      preparationVersion: 1,
      provider: 'replicate',
      referenceQuoteEvidence,
      target: resolvePredictionTarget(model),
    };
  },
);
