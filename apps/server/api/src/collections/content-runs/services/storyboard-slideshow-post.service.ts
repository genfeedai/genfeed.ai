import { assertStoryboardSlideshowComplete } from '@api/collections/content-runs/services/storyboard-plan-state';
import { StoryboardRunStoreService } from '@api/collections/content-runs/services/storyboard-run-store.service';
import type { PostCreateInput } from '@api/collections/posts/services/posts.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  PostCategory,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { isStoryboardSlideshow } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import { controlStoryboardRunSchema } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

export interface StoryboardSlideshowPostResult {
  /** True when this revision already had a draft post, so nothing new was made. */
  isExisting: boolean;
  postId: string;
  slideCount: number;
}

/**
 * One draft post from an approved slideshow (#8896): the slides' images are
 * attached in slide order (`PostIngredient.position`), the plan's caption is
 * the post text, and nothing is scheduled or published. Asking again for the
 * same revision returns the same draft.
 */
@Injectable()
export class StoryboardSlideshowPostService {
  constructor(
    private readonly store: StoryboardRunStoreService,
    private readonly posts: PostsService,
    private readonly prisma: PrismaService,
  ) {}

  async createDraft(
    organizationId: string,
    brandId: string,
    runId: string,
    userId: string,
    body: unknown,
  ): Promise<StoryboardSlideshowPostResult> {
    const parsed = controlStoryboardRunSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException(
        parsed.error.issues.map((issue) => issue.message).join('; '),
      );
    const { config } = await this.store.read(
      organizationId,
      brandId,
      runId,
      parsed.data.expectedRevision,
    );
    const { plan } = config;
    if (!isStoryboardSlideshow(plan))
      throw new BadRequestException('This storyboard is not a slideshow.');
    if (
      config.state !== 'approved' ||
      config.approvedRevision !== config.revision
    )
      throw new ConflictException(
        'Approve the slideshow before creating its post.',
      );
    assertStoryboardSlideshowComplete(plan);

    const targetIdempotencyKey = `storyboard-slideshow:${runId}:${config.revision}`;
    const existing = await this.prisma.post.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, { targetIdempotencyKey }),
    });
    if (existing)
      return {
        isExisting: true,
        postId: existing.id,
        slideCount: plan.shots.length,
      };

    const post = await this.posts.create({
      brandId,
      category: PostCategory.IMAGE,
      contentRunId: runId,
      description: plan.logline,
      // Slide order is the order of this array.
      ingredients: plan.shots.map((shot) => String(shot.stillAssetId)),
      label: (plan.title || 'Slideshow').slice(0, 200),
      organizationId,
      targetExecutionState: TargetExecutionState.DRAFT,
      targetIdempotencyKey,
      userId,
      visibility: PostVisibility.PUBLIC,
    } as unknown as PostCreateInput);
    return {
      isExisting: false,
      postId: String(post.id),
      slideCount: plan.shots.length,
    };
  }
}
