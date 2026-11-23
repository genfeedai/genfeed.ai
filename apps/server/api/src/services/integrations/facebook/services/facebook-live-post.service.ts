import {
  type PostCreateInput,
  PostsService,
} from '@api/collections/posts/services/posts.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { FacebookLiveVideoService } from '@api/services/integrations/facebook/services/facebook-live-video.service';
import {
  CredentialPlatform,
  PostCategory,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type {
  FacebookLiveState,
  IFacebookLiveVideo,
} from '@genfeedai/contracts/interfaces/integrations/facebook.interface';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

export interface FacebookLiveScope {
  brandId: string;
  credentialId: string;
  organizationId: string;
  userId: string;
}

interface FacebookLiveSettings {
  live?: { endedAt?: string; state?: FacebookLiveState };
}

/**
 * A Facebook live video as a post: the video id is the post's `externalId`,
 * its link the post's `url`, and the final state (and when it ended) sits in
 * the post's target settings. The stream key is never written to the post.
 */
@Traced()
@Injectable()
export class FacebookLivePostService {
  constructor(
    private readonly liveVideoService: FacebookLiveVideoService,
    private readonly postsService: PostsService,
  ) {}

  async start(
    scope: FacebookLiveScope,
    input: { description?: string; title: string },
  ): Promise<IFacebookLiveVideo> {
    const started = await this.liveVideoService.start(scope, input);

    // `url` is written by the service but is not a field of the create DTO.
    const data: PostCreateInput & { url?: string } = {
      brandId: scope.brandId,
      category: PostCategory.VIDEO,
      credentialId: scope.credentialId,
      description: input.description || input.title,
      externalId: started.liveVideoId,
      ingredients: [],
      label: input.title,
      organizationId: scope.organizationId,
      platform: CredentialPlatform.FACEBOOK,
      publicationDate: new Date(),
      targetExecutionState: TargetExecutionState.PUBLISHED,
      targetSettings: { live: { state: 'live' } },
      url: started.permalinkUrl,
      userId: scope.userId,
      visibility: PostVisibility.PUBLIC,
    };
    const post = await this.postsService.create(data);

    return {
      liveVideoId: started.liveVideoId,
      permalinkUrl: started.permalinkUrl,
      postId: String(post.id),
      state: 'live',
      streamKey: streamKeyOf(started.streamUrl),
      streamUrl: streamBaseOf(started.streamUrl),
    };
  }

  async end(
    scope: FacebookLiveScope,
    postId: string,
  ): Promise<IFacebookLiveVideo> {
    const post = await this.postsService.findOne({
      brandId: scope.brandId,
      credentialId: scope.credentialId,
      id: postId,
      isDeleted: false,
      organizationId: scope.organizationId,
      platform: CredentialPlatform.FACEBOOK,
    });
    const liveVideoId = post?.externalId;
    if (!post || !liveVideoId) {
      throw new NotFoundException('Live video', postId);
    }

    const after = await this.liveVideoService.end(scope, String(liveVideoId));
    const settings = (post.targetSettings ?? {}) as FacebookLiveSettings;
    const endedAt =
      settings.live?.endedAt ??
      (after.isLive ? undefined : new Date().toISOString());
    const state: FacebookLiveState = after.isLive ? 'live' : 'ended';

    await this.postsService.patch(String(post.id), {
      targetSettings: {
        ...(settings as Record<string, unknown>),
        live: { ...(endedAt ? { endedAt } : {}), state },
      },
      ...(after.permalinkUrl ? { url: after.permalinkUrl } : {}),
    } as Parameters<PostsService['patch']>[1]);

    return {
      endedAt,
      liveVideoId: String(liveVideoId),
      permalinkUrl: after.permalinkUrl ?? post.url ?? undefined,
      postId: String(post.id),
      state,
    };
  }
}

/** `rtmps://host:443/rtmp/<key>` splits at the last slash. */
function streamBaseOf(streamUrl: string): string {
  return streamUrl.slice(0, streamUrl.lastIndexOf('/'));
}

function streamKeyOf(streamUrl: string): string {
  return streamUrl.slice(streamUrl.lastIndexOf('/') + 1);
}
