import type { IAuthPublicMetadata } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import type { ActivitiesService } from '@api/collections/activities/services/activities.service';
import type { AccountHealthService } from '@api/collections/credentials/services/account-health.service';
import type { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import type {
  IngredientDocument,
  IngredientRefDocument,
} from '@api/collections/ingredients/schemas/ingredient.schema';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { CreatePostDto } from '@api/collections/posts/dto/create-post.dto';
import type { PostDocument } from '@api/collections/posts/schemas/post.schema';
import type { PostsService } from '@api/collections/posts/services/posts.service';
import type { QuotaService } from '@api/services/quota/quota.service';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  CredentialPlatform,
  IngredientCategory,
  PostCategory,
  PostStatus,
} from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';
import { HttpException, HttpStatus } from '@nestjs/common';

type LegacyPostCreateDependencies = {
  accountHealthService: AccountHealthService;
  activitiesService: ActivitiesService;
  credentialsService: CredentialsService;
  ingredientsService: IngredientsService;
  loggerService: LoggerService;
  postsService: PostsService;
  quotaService: QuotaService;
};

type LegacyPostCreateParams = {
  createPostDto: CreatePostDto;
  dependencies: LegacyPostCreateDependencies;
  publicMetadata: IAuthPublicMetadata;
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

function getIngredientRefId(
  value: string | IngredientRefDocument | null | undefined,
): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  return value?._id ?? value?.id;
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

export async function createLegacyPost({
  createPostDto,
  dependencies,
  publicMetadata,
}: LegacyPostCreateParams): Promise<PostDocument> {
  const credential = await dependencies.credentialsService.findOne({
    _id: createPostDto.credential,
    isConnected: true,
    isDeleted: false,
    organization: publicMetadata.organization,
  });

  if (!credential) {
    throw new HttpException(
      {
        detail: 'Credential not found',
        title: `Credential ${createPostDto.credential.toString()} not found`,
      },
      HttpStatus.NOT_FOUND,
    );
  }

  const textOnlyPlatforms = new Set([
    CredentialPlatform.THREADS,
    CredentialPlatform.TWITTER,
    CredentialPlatform.LINKEDIN,
  ]);
  const isTextOnlyPlatform = textOnlyPlatforms.has(
    credential.platform as CredentialPlatform,
  );

  if (
    createPostDto.status === PostStatus.SCHEDULED &&
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
    createPostDto.status === PostStatus.SCHEDULED &&
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
      publicMetadata.organization,
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
        publicMetadata.organization,
        publicMetadata.brand,
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
    publicMetadata.organization,
  );

  let effectiveStatus = createPostDto.status;
  let warmupHoldReason: string | undefined;
  if (createPostDto.status === PostStatus.SCHEDULED) {
    const publishGate =
      await dependencies.accountHealthService.evaluateScheduledPublishGate({
        brandId: publicMetadata.brand,
        credentialId: createPostDto.credential,
        organizationId: publicMetadata.organization,
      });

    if (publishGate.holdPublishing) {
      effectiveStatus = PostStatus.PENDING;
      warmupHoldReason = publishGate.reason;
    }
  }

  const data = await dependencies.postsService.create({
    ...createPostDto,
    brand: firstIngredient
      ? (getIngredientRefId(firstIngredient.brand) ?? publicMetadata.brand)
      : publicMetadata.brand,
    category:
      createPostDto.category || getPostCategoryFromIngredient(firstIngredient),
    credential: createPostDto.credential,
    description: createPostDto.description || credential.description || '',
    ingredients: ingredientIds,
    label:
      createPostDto.label?.trim() ||
      credential.label ||
      (createPostDto.description?.trim()
        ? extractLabelFromText(createPostDto.description.trim())
        : ''),
    organization: firstIngredient
      ? (getIngredientRefId(firstIngredient.organization) ??
        publicMetadata.organization)
      : publicMetadata.organization,
    platform: credential.platform as never,
    publishIntent: warmupHoldReason ? 'warmup_hold' : undefined,
    publicationDate: createPostDto.publicationDate,
    reviewFeedback: warmupHoldReason,
    scheduledDate: createPostDto.scheduledDate,
    status: effectiveStatus,
    tags: createPostDto.tags || [],
    user: publicMetadata.user,
  });

  await dependencies.activitiesService.create(
    new ActivityEntity({
      brand: firstIngredient
        ? (getIngredientRefId(firstIngredient.brand) ?? publicMetadata.brand)
        : publicMetadata.brand,
      entityId: data.id,
      entityModel: ActivityEntityModel.POST,
      key: warmupHoldReason
        ? ActivityKey.POST_CREATED
        : ActivityKey.VIDEO_SCHEDULED,
      organization: firstIngredient
        ? (getIngredientRefId(firstIngredient.organization) ??
          publicMetadata.organization)
        : publicMetadata.organization,
      source: ActivitySource.SCRIPT,
      user: publicMetadata.user,
      value: (data.id as string).toString(),
    }),
  );

  if (
    !warmupHoldReason &&
    String(credential.platform) === CredentialPlatform.YOUTUBE
  ) {
    dependencies.postsService.handleYoutubePost(data).catch((error) => {
      dependencies.loggerService.error(
        `Failed to trigger YouTube upload for post ${data.id}: ${error.message}`,
        error.stack,
      );
    });
  }

  return data;
}
