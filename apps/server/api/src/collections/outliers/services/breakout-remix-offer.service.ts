import type { BrandAccessActor } from '@api/authorization/brand-access/brand-access.service';
import type { DetectedBreakoutSource } from '@api/collections/outliers/services/breakout-response-execution-queue.util';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { ActivityKey, ActivitySource } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export const BREAKOUT_REMIX_OFFER_ENTITY_MODEL = 'BreakoutResponse';
export const BREAKOUT_REMIX_OFFER_SOURCE_TYPE = 'breakout_response';
/** A breakout older than this is history, not something to act on now. */
export const BREAKOUT_REMIX_OFFER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const SNIPPET_LENGTH = 80;

/**
 * What the bell item carries so the inbox can link to the remix. Exactly one of
 * `postId` (a post published from Genfeed) or `sourcePostId` (a native account
 * post) is set.
 */
export interface BreakoutRemixOfferPayload {
  version: 1;
  kind: 'breakout_remix_offer';
  brandId: string;
  platform: string;
  responseId: string;
  postId: string | null;
  sourcePostId: string | null;
}

function platformLabel(platform: string): string {
  return platform === 'twitter' ? 'X' : platform;
}

function snippet(text: string | null | undefined): string | null {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  return flat.length > SNIPPET_LENGTH
    ? `${flat.slice(0, SNIPPET_LENGTH - 1)}…`
    : flat;
}

/**
 * Tells the member whose collection found a breakout that the post is worth
 * remixing (#5788). The offer only records an activity, so it spends nothing and
 * does not depend on the organization's breakout-response opt-in. One offer per
 * detected response: a repeat collection of the same post returns the first
 * activity and writes nothing.
 */
@Injectable()
export class BreakoutRemixOfferService {
  private readonly context = { service: BreakoutRemixOfferService.name };

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityRecorder: ActivityRecorderService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * The detection is already committed, so a failed offer must never fail the
   * collection; the next collection of the same post offers again.
   */
  async offerAfterCommit(
    actor: BrandAccessActor,
    source: DetectedBreakoutSource,
  ): Promise<void> {
    try {
      await this.offer(actor, source);
    } catch (error: unknown) {
      this.logger.warn('Breakout remix offer was not recorded', {
        ...this.context,
        error: error instanceof Error ? error.message : String(error),
        organizationId: source.organizationId,
      });
    }
  }

  /** Returns the recorded activity id, or null when there is nothing to offer. */
  async offer(
    actor: BrandAccessActor,
    source: DetectedBreakoutSource,
  ): Promise<string | null> {
    if (
      !actor.userId ||
      actor.isApiKey ||
      actor.apiKeyId ||
      actor.organizationId !== source.organizationId
    ) {
      return null;
    }
    const response = await this.prisma.breakoutResponse.findFirst({
      where: scopedWhere(source.organizationId, {
        brandId: source.brandId,
        credentialId: source.credentialId,
        detectedAt: {
          gte: new Date(Date.now() - BREAKOUT_REMIX_OFFER_WINDOW_MS),
        },
        externalId: source.externalId,
        platform: source.platform,
      }),
      select: {
        detectedAt: true,
        id: true,
        nativeSourcePost: { select: { id: true, text: true } },
        sourcePost: { select: { description: true, id: true, label: true } },
      },
    });
    if (!response) return null;
    const post = response.sourcePost;
    const nativePost = response.nativeSourcePost;
    // Without a post the member can open, there is nothing to remix.
    if (!post && !nativePost) return null;

    const payload: BreakoutRemixOfferPayload = {
      brandId: source.brandId,
      kind: 'breakout_remix_offer',
      platform: source.platform,
      postId: post?.id ?? null,
      responseId: response.id,
      sourcePostId: post ? null : (nativePost?.id ?? null),
      version: 1,
    };
    const preview =
      snippet(post?.label) ??
      snippet(post?.description) ??
      snippet(nativePost?.text);
    const recorded = await this.activityRecorder.record({
      alert: {
        deduplicationKey: `${ActivityKey.BREAKOUT_REMIX_OFFERED}/${response.id}`,
        occurredAt: response.detectedAt,
        payload: { ...payload },
        source: {
          id: response.id,
          type: BREAKOUT_REMIX_OFFER_SOURCE_TYPE,
        },
      },
      brandId: source.brandId,
      entityId: response.id,
      entityModel: BREAKOUT_REMIX_OFFER_ENTITY_MODEL,
      key: ActivityKey.BREAKOUT_REMIX_OFFERED,
      organizationId: source.organizationId,
      source: ActivitySource.BREAKOUT_DETECTION,
      userId: actor.userId,
      value: preview
        ? `“${preview}” is outperforming your usual ${platformLabel(source.platform)} posts`
        : `A ${platformLabel(source.platform)} post is outperforming your usual posts`,
    });
    return recorded.id;
  }
}
