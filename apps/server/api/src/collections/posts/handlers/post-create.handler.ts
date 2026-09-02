import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import type { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { AccountHealthService } from '@api/collections/credentials/services/account-health.service';
import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { CreatePostDto } from '@api/collections/posts/dto/create-post.dto';
import type { PostDocument } from '@api/collections/posts/post.schema';
import type { PostsService } from '@api/collections/posts/services/posts.service';
import type { QuotaService } from '@api/services/quota/quota.service';
import { getSupportedPostVisibilities } from '@api-types/contracts/channel-capabilities.contract';
import { resolveDefaultTargetExecutionState } from '@api-types/contracts/scheduler.contract';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  CredentialPlatform,
  fromPrismaCredentialPlatform,
  IngredientCategory,
  PostCategory,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';

type PostCreateDependencies = {
  accountHealthService: AccountHealthService;
  activitiesService: ActivitiesService;
  credentialsService: CredentialsService;
  ingredientsService: IngredientsService;
  loggerService: LoggerService;
  postsService: PostsService;
  quotaService: QuotaService;
};

type PostCreateParams = {
  createPostDto: CreatePostDto;
  dependencies: PostCreateDependencies;
  identity: AuthenticatedUser;
};

function extractLabelFromText(text: string, maxLength: number = 50): string {
  if (!text || text.trim().length === 0) {
    return '';
  }

  const trimmed = text.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  const truncated = trimmed.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.7) {
    return `${truncated.substring(0, lastSpace)}...`;
  }
  return `${truncated}...`;
}

function getPostCategoryFromIngredient(
  ingredient: Pick<IngredientDocument, 'category'> | null,
): PostCategory {
  const category = String(ingredient?.category ?? '').toLowerCase();
  if (category === IngredientCategory.IMAGE.toLowerCase()) {
    return PostCategory.IMAGE;
  }
  if (category === IngredientCategory.VIDEO.toLowerCase()) {
    return PostCategory.VIDEO;
  }
  return PostCategory.TEXT;
}

export async function createPost({
  createPostDto,
  dependencies,
  identity,
}: PostCreateParams): Promise<PostDocument> {
  const requestedExecutionState = resolveDefaultTargetExecutionState({
    scheduledDate: createPostDto.scheduledDate,
    targetExecutionState: createPostDto.targetExecutionState,
  });
  const requestedVisibility = createPostDto.visibility ?? PostVisibility.PUBLIC;
  const credential = await dependencies.credentialsService.findOne({
    id: createPostDto.credentialId,
    isConnected: true,
    organizationId: identity.organizationId,
  });

  if (!credential) {
    throw new HttpException(
      {
        detail: 'Credential not found',
        title: `Credential ${createPostDto.credentialId.toString()} not found`,
      },
      HttpStatus.NOT_FOUND,
    );
  }

  const domainPlatform = fromPrismaCredentialPlatform(
    String(credential.platform ?? ''),
  );
  const textOnlyPlatforms = new Set([
    CredentialPlatform.THREADS,
    CredentialPlatform.TWITTER,
    CredentialPlatform.LINKEDIN,
  ]);
  const isTextOnlyPlatform = domainPlatform
    ? textOnlyPlatforms.has(domainPlatform)
    : false;

  if (
    !domainPlatform ||
    !getSupportedPostVisibilities(domainPlatform).includes(requestedVisibility)
  ) {
    throw new HttpException(
      {
        detail: `${credential.platform} does not support ${requestedVisibility} visibility.`,
        title: 'Unsupported post visibility',
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  if (
    requestedExecutionState === TargetExecutionState.SCHEDULED &&
    createPostDto.category === PostCategory.TEXT &&
    !isTextOnlyPlatform
  ) {
    throw new HttpException(
      {
        detail: `${credential.platform} requires media when scheduling. Please add at least one image or video.`,
        title: 'Text-only posts not supported',
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  if (
    requestedExecutionState === TargetExecutionState.SCHEDULED &&
    !isTextOnlyPlatform &&
    (!createPostDto.ingredients || createPostDto.ingredients.length === 0)
  ) {
    throw new HttpException(
      {
        detail: `${credential.platform} requires at least one image or video when scheduling.`,
        title: 'Media required when scheduling',
      },
      HttpStatus.BAD_REQUEST,
    );
  }

  let firstIngredient: IngredientDocument | null = null;
  let ingredientIds: string[] = [];

  if (createPostDto.ingredients && createPostDto.ingredients.length > 0) {
    const ingredients = await dependencies.ingredientsService.findByIds(
      createPostDto.ingredients,
      identity.organizationId,
    );

    if (ingredients.length !== createPostDto.ingredients.length) {
      const foundIds = new Set(
        ingredients.map((ingredient) => ingredient.id.toString()),
      );
      const missingId = createPostDto.ingredients.find(
        (id) => !foundIds.has(id.toString()),
      );
      throw new HttpException(
        {
          detail:
            'Ingredient not found or does not belong to your organization',
          title: `Ingredient ${missingId?.toString()} not found`,
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const ingredientMap = new Map(
      ingredients.map((ingredient) => [ingredient.id.toString(), ingredient]),
    );
    ingredientIds = createPostDto.ingredients.map((id) => id);
    firstIngredient =
      ingredientMap.get(createPostDto.ingredients[0].toString()) ?? null;
  } else if (createPostDto.campaign) {
    const campaignIngredients =
      await dependencies.ingredientsService.findApprovedImagesByCampaign(
        createPostDto.campaign,
        identity.organizationId,
        identity.brandId,
      );

    if (campaignIngredients.length === 0) {
      throw new HttpException(
        {
          detail:
            'No approved campaign images were found for the selected brand',
          title: `Campaign ${createPostDto.campaign} not found`,
        },
        HttpStatus.NOT_FOUND,
      );
    }

    ingredientIds = campaignIngredients.map((ingredient) => ingredient.id);
    [firstIngredient = null] = campaignIngredients;
  }

  await dependencies.quotaService.verifyQuota(
    credential,
    identity.organizationId,
  );

  let effectiveExecutionState = requestedExecutionState;
  let warmupHoldReason: string | undefined;
  if (requestedExecutionState === TargetExecutionState.SCHEDULED) {
    const publishGate =
      await dependencies.accountHealthService.evaluateScheduledPublishGate({
        brandId: identity.brandId,
        credentialId: createPostDto.credentialId,
        organizationId: identity.organizationId,
      });

    if (publishGate.holdPublishing) {
      effectiveExecutionState = TargetExecutionState.PAUSED;
      warmupHoldReason = publishGate.reason;
    }
  }

  const data = await dependencies.postsService.create({
    ...createPostDto,
    brandId: firstIngredient?.brandId ?? identity.brandId,
    category:
      createPostDto.category || getPostCategoryFromIngredient(firstIngredient),
    credentialId: createPostDto.credentialId,
    description: createPostDto.description || credential.description || '',
    ingredients: ingredientIds,
    label:
      createPostDto.label?.trim() ||
      credential.label ||
      (createPostDto.description?.trim()
        ? extractLabelFromText(createPostDto.description.trim())
        : ''),
    organizationId: firstIngredient?.organizationId ?? identity.organizationId,
    // credentials.platform is Prisma SCREAMING; posts.platform is lowercase.
    // fromPrismaCredentialPlatform already owns that mapping — an unknown
    // credential platform stays undefined rather than inventing a dual map.
    platform: domainPlatform,
    publishIntent: warmupHoldReason ? 'warmup_hold' : undefined,
    publicationDate: createPostDto.publicationDate,
    reviewFeedback: warmupHoldReason,
    scheduledDate: createPostDto.scheduledDate,
    targetExecutionState: effectiveExecutionState,
    tags: createPostDto.tags || [],
    userId: identity.userId,
    visibility: requestedVisibility,
  });

  await dependencies.activitiesService.create(
    new ActivityEntity({
      brandId: firstIngredient?.brandId ?? identity.brandId,
      entityId: data.id,
      entityModel: ActivityEntityModel.POST,
      key: warmupHoldReason
        ? ActivityKey.POST_CREATED
        : ActivityKey.VIDEO_SCHEDULED,
      organizationId:
        firstIngredient?.organizationId ?? identity.organizationId,
      source: ActivitySource.SCRIPT,
      userId: identity.userId,
      value: (data.id as string).toString(),
    }),
  );

  if (!warmupHoldReason && domainPlatform === CredentialPlatform.YOUTUBE) {
    dependencies.postsService.handleYoutubePost(data).catch((error) => {
      dependencies.loggerService.error(
        `Failed to trigger YouTube upload for post ${data.id}: ${error.message}`,
        error.stack,
      );
    });
  }

  return data;
}
