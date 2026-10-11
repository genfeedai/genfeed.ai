import process from 'node:process';
import { CredentialEntity } from '@api/collections/credentials/entities/credential.entity';
import { IngredientEntity } from '@api/collections/ingredients/entities/ingredient.entity';
import { assertBreakoutPublicationDispatch } from '@api/collections/outliers/services/breakout-publication-fence.util';
import type { PostDocument } from '@api/collections/posts/post.schema';
import type { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CredentialPlatform,
  fromPrismaCredentialPlatform,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { resolvePostVisibility } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import type { LoggerService } from '@libs/logger/logger.service';
import { getUserRoomName } from '@libs/websockets/room-name.util';

export type PostYoutubeUploadDependencies = Readonly<{
  fileQueueService: Pick<FileQueueService, 'uploadYoutube'> | undefined;
  logger: Pick<LoggerService, 'error' | 'log' | 'warn'>;
  patch: (
    id: string,
    dto: { targetExecutionState: TargetExecutionState },
  ) => Promise<unknown>;
  prisma: PrismaService;
}>;

/**
 * Queues the YouTube upload of a post for every visibility (UNLISTED, PUBLIC, PRIVATE,
 * SCHEDULED).
 *
 * The provider upload is queued from here, so a breakout response is admitted at dispatch
 * exactly as the scheduled delivery does right before its provider call: the pinned actor
 * still live, the source still hot, the evidence current. Ordinary posts pass untouched. A
 * hold throws before the PUBLISHING write and before any upload job.
 */
export async function queueYoutubePostUpload(
  deps: PostYoutubeUploadDependencies,
  post: PostDocument,
): Promise<void> {
  const ingredients = Array.isArray(post.ingredients) ? post.ingredients : [];

  if (!post.credential || ingredients.length === 0) {
    throw new Error('Post must have credential and at least one ingredient');
  }

  const credential = post.credential as unknown as CredentialEntity;
  const ingredient = ingredients[0] as unknown as IngredientEntity;

  if (
    fromPrismaCredentialPlatform(String(credential.platform ?? '')) !==
    CredentialPlatform.YOUTUBE
  ) {
    deps.logger.warn(
      `handleYoutubePost called for non-YouTube platform: ${credential.platform}`,
    );
    return;
  }

  const originalVisibility = resolvePostVisibility(post.visibility);
  const postId = String(post.id);

  await assertBreakoutPublicationDispatch(deps.prisma, {
    organizationId: post.organizationId,
    postId,
  });

  await deps.patch(postId, {
    targetExecutionState: TargetExecutionState.PUBLISHING,
  });

  try {
    const brandId = post.brandId;
    const organizationId = post.organizationId;
    const userId = post.userId;

    await deps.fileQueueService?.uploadYoutube({
      brandId,
      credentialId: credential.id.toString(),
      description: post.description || '',
      ingredientId: ingredient.id.toString(),
      organizationId,
      postId,
      room: userId ? getUserRoomName(userId) : undefined,
      scheduledDate: post.scheduledDate ?? undefined,
      visibility: originalVisibility,
      tags:
        (post.tags as unknown as ({ name?: string } | string)[])?.map((tag) =>
          typeof tag === 'object' && tag?.name ? tag.name : String(tag),
        ) || [],
      title: post.label || 'Untitled',
      userId,
      websocketUrl: process.env.WEBSOCKET_URL,
    });

    deps.logger.log(`YouTube upload job enqueued for post ${postId}`);
  } catch (error: unknown) {
    deps.logger.error(
      `Failed to enqueue YouTube upload for post ${postId}: ${(error as Error)?.message}`,
      (error as Error)?.stack,
    );

    await deps.patch(postId, {
      targetExecutionState: TargetExecutionState.FAILED,
    });

    throw error;
  }
}
