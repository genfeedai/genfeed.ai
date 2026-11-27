import { requireMetaScopes } from '@api/services/integrations/_shared/meta-page-access.util';
import { readInstagramVerificationPage } from '@api/services/integrations/instagram/services/instagram-verification-reader.util';
import {
  getInstagramGraphError,
  isInstagramRejectedRequestError,
} from '@api/services/integrations/instagram/utils/instagram-error.util';
import type { ProviderVerificationPage } from '@api/services/integrations/publishers/interfaces/publish-verification.interface';
import { InstagramMediaType } from '@genfeedai/contracts';
import {
  INSTAGRAM_ALT_TEXT_MAX_LENGTH,
  type InstagramAudioConfiguration,
  type InstagramAudioTrack,
  type InstagramAudioType,
  type InstagramContainerRequest,
} from '@genfeedai/contracts/api-types/contracts/instagram-publishing.contract';
import type {
  InstagramCredentialResponse,
  InstagramMessageRecipient,
} from '@genfeedai/contracts/interfaces/integrations/instagram.interface';
import { readNonBlankString } from '@genfeedai/utils/data/extract.util';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

type ResolveInstagramCredential = (
  organizationId: string,
  brandId: string,
  credentialId?: string,
) => Promise<InstagramCredentialResponse>;

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Instagram credential is missing ${field}`);
  }

  return value;
}

function formatCaption(caption: string, hashtags?: string[]): string {
  if (!hashtags?.length) {
    return caption;
  }
  return `${caption}\n\n${hashtags.map((tag) => `#${tag}`).join(' ')}`;
}

/** The AI label as the optional container field the Graph API expects. */
function aiLabelParams(isAiGenerated: boolean): Record<string, boolean> {
  return isAiGenerated ? { is_ai_generated: true } : {};
}

type ContainerParams = Record<string, string | boolean>;

/**
 * The optional fields of a container as attempts, most decorated first: all of
 * them, then the AI label alone, then none. The label is kept when only the
 * other field (alt text, or a Reel's cover) is refused; the post goes out plain
 * only as the last resort.
 */
function decorationAttempts(
  label: Record<string, boolean>,
  extra: Record<string, string>,
  required: Record<string, string> = {},
): ContainerParams[] {
  const attempts: ContainerParams[] = [{ ...label, ...extra, ...required }];
  if (Object.keys(label).length > 0 && Object.keys(extra).length > 0) {
    attempts.push({ ...label, ...required });
  }
  if (Object.keys(label).length + Object.keys(extra).length > 0) {
    attempts.push({ ...required });
  }
  return attempts;
}

/**
 * A Reel's music as the `audio_configuration` container field, a JSON string.
 * Unlike the label and cover it is never dropped on a retry: Genfeed's Reels
 * are often muted on purpose, so a Reel that lost its track would go out
 * silent. If Instagram refuses the track the publish fails and says so.
 */
function audioParams(
  audio?: InstagramAudioConfiguration,
): Record<string, string> {
  const audioId = audio?.audio_id?.trim();
  if (!audio || !audioId) {
    return {};
  }
  return {
    audio_configuration: JSON.stringify({ ...audio, audio_id: audioId }),
  };
}

/** One `ig_audio` entry as a track, or `undefined` when it has no id. */
function toAudioTrack(
  entry: unknown,
  fallbackType: InstagramAudioType,
): InstagramAudioTrack | undefined {
  if (!entry || typeof entry !== 'object') return undefined;
  const raw = entry as Record<string, unknown>;
  const id = readNonBlankString(raw.audio_id);
  if (!id) return undefined;
  const audioType =
    raw.audio_type === 'original_sound'
      ? 'original_sound'
      : raw.audio_type === 'music'
        ? 'music'
        : fallbackType;
  return {
    audioType,
    id,
    title: readNonBlankString(raw.title) ?? id,
    ...(readNonBlankString(raw.display_artist)
      ? { artist: readNonBlankString(raw.display_artist) }
      : {}),
    ...(typeof raw.duration_in_ms === 'number'
      ? { durationMs: raw.duration_in_ms }
      : {}),
    ...(readNonBlankString(raw.cover_artwork_thumbnail_uri)
      ? { coverArtworkUrl: readNonBlankString(raw.cover_artwork_thumbnail_uri) }
      : {}),
    ...(readNonBlankString(raw.on_platform_audio_preview_link)
      ? { previewUrl: readNonBlankString(raw.on_platform_audio_preview_link) }
      : {}),
    ...(readNonBlankString(raw.ig_username)
      ? { igUsername: readNonBlankString(raw.ig_username) }
      : {}),
    ...(typeof raw.is_ads_eligible === 'boolean'
      ? { isAdsEligible: raw.is_ads_eligible }
      : {}),
  };
}

/**
 * An image's alt text as the optional container field. Blank text sends
 * nothing; text over Instagram's limit is cut by character (a pair of code units
 * such as an emoji is never split) rather than refused, because
 * the Library already caps what it saves at the same length.
 */
function altTextParams(altText?: string): Record<string, string> {
  const text = Array.from(altText?.trim() ?? '')
    .slice(0, INSTAGRAM_ALT_TEXT_MAX_LENGTH)
    .join('');
  return text ? { alt_text: text } : {};
}

/** Owns Instagram write operations while the facade retains credential APIs. */
export class InstagramPublishingService {
  constructor(
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
    private readonly graphUrl: string,
    private readonly apiVersion: string,
    private readonly resolveCredential: ResolveInstagramCredential,
  ) {}

  /** Replies inside the provider's existing messaging window. */
  @Traced()
  async sendDirectMessage(
    organizationId: string,
    brandId: string,
    recipientId: string,
    message: string,
    credentialId?: string,
  ): Promise<string> {
    return this.sendMessage(
      organizationId,
      brandId,
      { id: recipientId },
      message,
      credentialId,
    );
  }

  /**
   * Subscribes the Instagram account to the app's `messages` webhook so new
   * Direct messages are pushed instead of polled. The account itself is
   * subscribed with the client's Unified Login token; no Page is involved.
   *
   * @see https://developers.facebook.com/documentation/instagram-platform/webhooks/setup
   * @see https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks
   */
  @Traced()
  async subscribeToMessageWebhooks(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<void> {
    const url = `InstagramService ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.resolveCredential(
        organizationId,
        brandId,
        credentialId,
      );
      requireMetaScopes(credential.grantedScopes, [
        'instagram_manage_messages',
      ]);
      const accessToken = EncryptionUtil.decrypt(credential.accessToken);
      const externalId = requireString(credential.externalId, 'externalId');
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${externalId}/subscribed_apps`,
          null,
          {
            params: {
              access_token: accessToken,
              subscribed_fields: 'messages',
            },
          },
        ),
      );

      this.loggerService.log(`${url} succeeded`, response.data);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /** Initial comment replies use comment_id, not the commenter's scoped ID. */
  @Traced()
  async sendPrivateReply(
    organizationId: string,
    brandId: string,
    commentId: string,
    message: string,
    credentialId?: string,
  ): Promise<string> {
    return this.sendMessage(
      organizationId,
      brandId,
      { comment_id: commentId },
      message,
      credentialId,
    );
  }

  @Traced()
  private async sendMessage(
    organizationId: string,
    brandId: string,
    recipient: InstagramMessageRecipient,
    message: string,
    credentialId?: string,
  ): Promise<string> {
    const url = `InstagramService ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.resolveCredential(
        organizationId,
        brandId,
        credentialId,
      );
      const isPrivateReply = 'comment_id' in recipient;
      requireMetaScopes(
        credential.grantedScopes,
        isPrivateReply
          ? ['instagram_manage_comments', 'instagram_manage_messages']
          : ['instagram_manage_messages'],
      );
      const accessToken = EncryptionUtil.decrypt(credential.accessToken);
      const externalId = requireString(credential.externalId, 'externalId');
      // Unified Login sends from the account itself with the client's token;
      // no Facebook Page exists.
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${externalId}/messages`,
          {
            message: { text: message },
            ...('id' in recipient ? { messaging_type: 'RESPONSE' } : {}),
            recipient,
          },
          { params: { access_token: accessToken } },
        ),
      );

      this.loggerService.log(`${url} succeeded`, response.data);
      return requireString(
        response.data?.message_id,
        'message_id in the Meta response',
      );
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  @Traced()
  async uploadImage(
    organizationId: string,
    brandId: string,
    imageUrl: string,
    caption: string,
    hashtags?: string[],
    credentialId?: string,
    isAiGenerated = false,
    altText?: string,
  ): Promise<{ mediaId: string; shortcode: string }> {
    const url = `InstagramService ${CallerUtil.getCallerName()}`;
    const credential = await this.resolveCredential(
      organizationId,
      brandId,
      credentialId,
    );
    const externalId = requireString(credential.externalId, 'externalId');
    const accessToken = EncryptionUtil.decrypt(credential.accessToken);

    try {
      const containerId = await this.createPostContainer(
        externalId,
        accessToken,
        {
          altText,
          caption: formatCaption(caption, hashtags),
          imageUrl,
          isAiGenerated,
          kind: 'image',
        },
      );
      const publishRes = await this.publishContainer(
        externalId,
        containerId,
        accessToken,
      );

      this.loggerService.log(`${url} succeeded`, publishRes.data);
      const mediaId = publishRes.data.id;
      return {
        mediaId,
        shortcode: await this.getMediaShortcode(mediaId, accessToken),
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  @Traced()
  async uploadReel(
    organizationId: string,
    brandId: string,
    videoUrl: string,
    caption: string,
    coverImageUrl?: string,
    hashtags?: string[],
    isShareToFeedSelected = true,
    credentialId?: string,
    isAiGenerated = false,
    audio?: InstagramAudioConfiguration,
  ): Promise<{ mediaId: string; shortcode: string }> {
    const url = `InstagramService ${CallerUtil.getCallerName()}`;
    const credential = await this.resolveCredential(
      organizationId,
      brandId,
      credentialId,
    );
    const externalId = requireString(credential.externalId, 'externalId');
    const accessToken = EncryptionUtil.decrypt(credential.accessToken);

    try {
      const containerId = await this.createPostContainer(
        externalId,
        accessToken,
        {
          audio,
          caption: formatCaption(caption, hashtags),
          coverImageUrl,
          isAiGenerated,
          isShareToFeedSelected,
          kind: 'reel',
          videoUrl,
        },
      );
      await this.waitForMediaProcessing(containerId, accessToken);
      const publishRes = await this.publishContainer(
        externalId,
        containerId,
        accessToken,
      );

      this.loggerService.log(`${url} succeeded`, publishRes.data);
      const mediaId = publishRes.data.id;
      return {
        mediaId,
        shortcode: await this.getMediaShortcode(mediaId, accessToken),
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Lists tracks from Instagram's Audio API catalogue: trending when there is
   * no query, otherwise a search. Instagram only returns audio cleared for
   * third-party use. The token is the connected account's own, so a Unified
   * Login credential asks as the account it publishes from.
   */
  @Traced()
  async listAudio(
    organizationId: string,
    brandId: string,
    audioType: InstagramAudioType,
    searchQuery?: string,
    credentialId?: string,
  ): Promise<InstagramAudioTrack[]> {
    const credential = await this.resolveCredential(
      organizationId,
      brandId,
      credentialId,
    );
    const externalId = requireString(credential.externalId, 'externalId');
    const accessToken = EncryptionUtil.decrypt(credential.accessToken);
    const query = searchQuery?.trim();

    const response = await firstValueFrom(
      this.httpService.get(`${this.graphUrl}/${this.apiVersion}/ig_audio`, {
        params: {
          access_token: accessToken,
          audio_type: audioType,
          ...(query ? { search_query: query } : {}),
          user_id: externalId,
        },
      }),
    );

    const entries: unknown[] = Array.isArray(response.data?.audio)
      ? response.data.audio
      : [];
    return entries.flatMap((entry) => {
      const track = toAudioTrack(entry, audioType);
      return track ? [track] : [];
    });
  }

  /**
   * Publish one image or video as a Story. A Story carries no caption and no
   * alt text through the API, so only the optional AI label is sent. A video
   * is processed before it can be published; an image is ready at once.
   */
  @Traced()
  async uploadStory(
    organizationId: string,
    brandId: string,
    mediaUrl: string,
    isVideo: boolean,
    credentialId?: string,
    isAiGenerated = false,
  ): Promise<{ mediaId: string }> {
    const url = `InstagramService ${CallerUtil.getCallerName()}`;
    const credential = await this.resolveCredential(
      organizationId,
      brandId,
      credentialId,
    );
    const externalId = requireString(credential.externalId, 'externalId');
    const accessToken = EncryptionUtil.decrypt(credential.accessToken);

    try {
      const containerId = await this.createPostContainer(
        externalId,
        accessToken,
        { isAiGenerated, isVideo, kind: 'story', mediaUrl },
      );
      if (isVideo) {
        await this.waitForMediaProcessing(containerId, accessToken);
      }
      const publishRes = await this.publishContainer(
        externalId,
        containerId,
        accessToken,
      );

      this.loggerService.log(`${url} succeeded`, publishRes.data);
      return { mediaId: publishRes.data.id };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  @Traced()
  async uploadCarousel(
    organizationId: string,
    brandId: string,
    mediaUrls: string[],
    caption: string,
    hashtags?: string[],
    credentialId?: string,
    isAiGenerated = false,
    altTexts: ReadonlyArray<string | undefined> = [],
  ): Promise<{ mediaId: string; shortcode: string }> {
    const url = `InstagramService ${CallerUtil.getCallerName()}`;
    const credential = await this.resolveCredential(
      organizationId,
      brandId,
      credentialId,
    );
    const externalId = requireString(credential.externalId, 'externalId');
    const accessToken = EncryptionUtil.decrypt(credential.accessToken);

    try {
      const containerId = await this.createPostContainer(
        externalId,
        accessToken,
        {
          altTexts,
          caption: formatCaption(caption, hashtags),
          imageUrls: mediaUrls,
          isAiGenerated,
          kind: 'carousel',
        },
      );
      const publishRes = await this.publishContainer(
        externalId,
        containerId,
        accessToken,
      );

      this.loggerService.log(`${url} succeeded`, publishRes.data);
      const mediaId = publishRes.data.id;
      return {
        mediaId,
        shortcode: await this.getMediaShortcode(mediaId, accessToken),
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Creates a post's container without publishing it and waits until
   * Instagram has processed it, so publishing it later is a single
   * `media_publish` call. Used ahead of a scheduled post's due time; a
   * container nobody publishes expires on Instagram's side.
   */
  @Traced()
  async prepareContainer(
    organizationId: string,
    brandId: string,
    request: InstagramContainerRequest,
    credentialId?: string,
  ): Promise<string> {
    const url = `InstagramService ${CallerUtil.getCallerName()}`;
    const credential = await this.resolveCredential(
      organizationId,
      brandId,
      credentialId,
    );
    const externalId = requireString(credential.externalId, 'externalId');
    const accessToken = EncryptionUtil.decrypt(credential.accessToken);

    try {
      const containerId = await this.createPostContainer(
        externalId,
        accessToken,
        request,
      );
      await this.waitForMediaProcessing(containerId, accessToken);
      this.loggerService.log(`${url} succeeded`, {
        containerId,
        kind: request.kind,
      });
      return containerId;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Publishes a container `prepareContainer` made, from the same account. A
   * story has no shortcode, so none is read for it.
   */
  @Traced()
  async publishPreparedContainer(
    organizationId: string,
    brandId: string,
    containerId: string,
    isStory: boolean,
    credentialId?: string,
  ): Promise<{ mediaId: string; shortcode: string | null }> {
    const url = `InstagramService ${CallerUtil.getCallerName()}`;
    const credential = await this.resolveCredential(
      organizationId,
      brandId,
      credentialId,
    );
    const externalId = requireString(credential.externalId, 'externalId');
    const accessToken = EncryptionUtil.decrypt(credential.accessToken);

    try {
      const publishRes = await this.publishContainer(
        externalId,
        containerId,
        accessToken,
      );
      this.loggerService.log(`${url} succeeded`, publishRes.data);
      const mediaId = publishRes.data.id;
      return {
        mediaId,
        shortcode: isStory
          ? null
          : await this.getMediaShortcode(mediaId, accessToken),
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * One page of the account's media created since a publish attempt began, for
   * confirming an uncertain publish. Reads only the account the post was
   * scheduled for: a changed or reconnected account is refused.
   */
  @Traced()
  async listPublishVerificationPage(
    organizationId: string,
    brandId: string,
    credentialId: string,
    expectedExternalId: string | null,
    attemptStartedAt: Date,
    cursor?: string,
  ): Promise<ProviderVerificationPage> {
    const credential = await this.resolveCredential(
      organizationId,
      brandId,
      credentialId,
    );
    if (
      !credential.externalId ||
      credential.externalId !== expectedExternalId
    ) {
      throw new Error('Instagram verification account unavailable or changed');
    }
    return readInstagramVerificationPage(
      this.httpService,
      `${this.graphUrl}/${this.apiVersion}`,
      credential.externalId,
      EncryptionUtil.decrypt(credential.accessToken),
      attemptStartedAt,
      cursor,
    );
  }

  @Traced()
  async postComment(
    organizationId: string,
    brandId: string,
    mediaId: string,
    text: string,
    credentialId?: string,
  ): Promise<{ commentId: string }> {
    const url = `InstagramService ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.resolveCredential(
        organizationId,
        brandId,
        credentialId,
      );
      const accessToken = EncryptionUtil.decrypt(credential.accessToken);
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${mediaId}/comments`,
          null,
          { params: { access_token: accessToken, message: text } },
        ),
      );

      this.loggerService.log(`${url} succeeded`, response.data);
      return { commentId: response.data.id };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Creates the container that publishes one post and returns its id. A
   * carousel creates one container per slide first (each carries its own alt
   * text), then the carousel container. It does not wait for processing.
   */
  @Traced()
  private async createPostContainer(
    externalId: string,
    accessToken: string,
    request: InstagramContainerRequest,
  ): Promise<string> {
    const label = aiLabelParams(request.isAiGenerated);
    switch (request.kind) {
      case 'image': {
        const response = await this.createMediaContainer(
          externalId,
          {
            access_token: accessToken,
            caption: request.caption,
            image_url: request.imageUrl,
          },
          decorationAttempts(label, altTextParams(request.altText)),
        );
        return response.data.id;
      }
      case 'reel': {
        const response = await this.createMediaContainer(
          externalId,
          {
            access_token: accessToken,
            caption: request.caption,
            media_type: InstagramMediaType.REELS,
            share_to_feed: request.isShareToFeedSelected,
            video_url: request.videoUrl,
          },
          decorationAttempts(
            label,
            request.coverImageUrl ? { cover_url: request.coverImageUrl } : {},
            audioParams(request.audio),
          ),
        );
        return response.data.id;
      }
      case 'story': {
        const response = await this.createMediaContainer(
          externalId,
          {
            access_token: accessToken,
            media_type: InstagramMediaType.STORIES,
            ...(request.isVideo
              ? { video_url: request.mediaUrl }
              : { image_url: request.mediaUrl }),
          },
          decorationAttempts(label, {}),
        );
        return response.data.id;
      }
      case 'carousel': {
        const containerIds: string[] = [];
        for (const [index, imageUrl] of request.imageUrls.entries()) {
          const response = await this.createMediaContainer(
            externalId,
            {
              access_token: accessToken,
              image_url: imageUrl,
              is_carousel_item: true,
            },
            decorationAttempts({}, altTextParams(request.altTexts[index])),
          );
          containerIds.push(response.data.id);
        }
        const response = await this.createMediaContainer(
          externalId,
          {
            access_token: accessToken,
            caption: request.caption,
            children: containerIds.join(','),
            media_type: InstagramMediaType.CAROUSEL,
          },
          decorationAttempts(label, {}),
        );
        return response.data.id;
      }
    }
  }

  /**
   * Creates one media container. `attempts` are the optional fields that
   * decorate the post without being needed to publish it (the AI label, an
   * image's alt text and a Reel's cover), most decorated first, ending in none
   * (a Reel's music rides along in every attempt). If Instagram
   * refuses a request with a client error, the same container is created
   * again with the next attempt, because a missed label or alt text costs less
   * than a missed post. Nothing is published at this step, so a retry cannot
   * post twice.
   */
  @Traced()
  private async createMediaContainer(
    externalId: string,
    params: ContainerParams,
    attempts: ContainerParams[] = [{}],
  ) {
    const create = (extra: ContainerParams) =>
      firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${externalId}/media`,
          null,
          { params: { ...params, ...extra } },
        ),
      );

    for (const [index, extra] of attempts.entries()) {
      try {
        return await create(extra);
      } catch (error: unknown) {
        if (
          index === attempts.length - 1 ||
          !isInstagramRejectedRequestError(error)
        ) {
          throw error;
        }
        this.loggerService.warn(
          'Instagram refused the container with its optional fields (AI label, alt text or cover); creating it again with fewer',
          {
            error: getInstagramGraphError(error)?.message,
            fields: Object.keys(extra),
          },
        );
      }
    }
    return create({});
  }

  private publishContainer(
    externalId: string,
    containerId: string,
    accessToken: string,
  ) {
    return firstValueFrom(
      this.httpService.post(
        `${this.graphUrl}/${this.apiVersion}/${externalId}/media_publish`,
        null,
        {
          params: {
            access_token: accessToken,
            creation_id: containerId,
          },
        },
      ),
    );
  }

  @Traced()
  private async waitForMediaProcessing(
    containerId: string,
    accessToken: string,
    maxAttempts = 30,
    delayMs = 2000,
  ): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const statusRes = await firstValueFrom(
        this.httpService.get(
          `${this.graphUrl}/${this.apiVersion}/${containerId}`,
          { params: { access_token: accessToken, fields: 'status_code' } },
        ),
      );
      if (statusRes.data.status_code === 'FINISHED') {
        return;
      }
      if (statusRes.data.status_code === 'ERROR') {
        throw new Error('Media processing failed');
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error('Media processing timeout');
  }

  @Traced()
  private async getMediaShortcode(
    mediaId: string,
    accessToken: string,
  ): Promise<string> {
    const url = `InstagramService ${CallerUtil.getCallerName()}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.graphUrl}/${this.apiVersion}/${mediaId}`, {
          params: { access_token: accessToken, fields: 'shortcode' },
        }),
      );
      const shortcode = response.data?.shortcode;
      if (!shortcode) {
        this.loggerService.error(
          `${url} - No shortcode found in response, using numeric ID`,
          { mediaId },
        );
        return mediaId;
      }

      this.loggerService.log(`${url} - Retrieved shortcode for media`, {
        mediaId,
        shortcode,
      });
      return shortcode;
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} - Failed to fetch shortcode, using numeric ID`,
        { error, mediaId },
      );
      return mediaId;
    }
  }
}
