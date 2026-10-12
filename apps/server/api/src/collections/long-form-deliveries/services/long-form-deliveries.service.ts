import { ArticlesService } from '@api/collections/articles/services/articles.service';
import type { CreateArticleDeliveryDto } from '@api/collections/long-form-deliveries/dto/create-article-delivery.dto';
import type { CreateNewsletterDeliveryDto } from '@api/collections/long-form-deliveries/dto/create-newsletter-delivery.dto';
import { NewslettersService } from '@api/collections/newsletters/services/newsletters.service';
import { renderNewsletterHtml } from '@api/collections/newsletters/utils/newsletter-html.util';
import type { LongFormDeliverySource } from '@api/collections/post-groups/services/post-group.types';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ArticleFilterUtil } from '@api/helpers/utils/article-filter/article-filter.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  ArticleStatus,
  fromPrismaCredentialPlatform,
  ReleaseStatus,
} from '@genfeedai/contracts';
import {
  isArticleDeliveryPlatform,
  isNewsletterDeliveryPlatform,
} from '@genfeedai/contracts/constants';
import type {
  IChannelTarget,
  IReleaseGroup,
  PostGroupCreateProvenance,
} from '@genfeedai/contracts/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';

export type LongFormDeliveryContext = {
  brandId: string;
  organizationId: string;
  userId: string;
};

type DeliveryRelease = {
  baseContent: string;
  brandId: string;
  credentialId: string;
  idempotencyKey: string;
  platform: string;
  provenance: PostGroupCreateProvenance;
  scheduledDate?: Date;
  settings?: Record<string, unknown>;
  title: string;
};

const NEWSLETTER_PUBLISHED_STATUS = 'published';

/**
 * Delivers composer Articles and Newsletters to the brand's connected
 * long-form accounts (#6753). A delivery is an ordinary scheduler release with
 * one target, so validation, readiness, approval, retries, provider
 * verification and URL capture are the scheduler's own. The release target
 * links back to its source through `entityArticleId` / `entityNewsletterId`.
 */
@Injectable()
export class LongFormDeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly postGroupsService: PostGroupsService,
    private readonly articlesService: ArticlesService,
    private readonly newslettersService: NewslettersService,
  ) {}

  /**
   * Publish an article to a connected Ghost, WordPress or Medium account and
   * mark it published in the workspace. Access matches the article editor's
   * publish path: the caller's brand, and their own or an organization-scoped
   * article.
   */
  async deliverArticle(
    ctx: LongFormDeliveryContext,
    articleId: string,
    dto: CreateArticleDeliveryDto,
  ): Promise<IReleaseGroup> {
    const article = await this.prisma.article.findFirst({
      select: {
        brandId: true,
        content: true,
        id: true,
        label: true,
        status: true,
        updatedAt: true,
      },
      where: scopedWhere(ctx.organizationId, {
        brandId: ctx.brandId,
        id: articleId,
        OR: [{ userId: ctx.userId }, { scope: 'ORGANIZATION' }],
      }),
    });
    if (!article?.brandId) {
      throw new NotFoundException('Article', articleId);
    }

    const html = article.content?.trim();
    if (!html) {
      throw new BadRequestException(
        'Article must have content before it can be delivered',
      );
    }

    const platform = await this.resolveDeliveryPlatform(
      ctx.organizationId,
      article.brandId,
      dto.credentialId,
      isArticleDeliveryPlatform,
      'a connected Ghost, WordPress or Medium account',
    );

    const release = await this.queueRelease(ctx, {
      baseContent: html,
      brandId: article.brandId,
      credentialId: dto.credentialId,
      // One delivery per account and article revision: a retried click returns
      // the release already queued instead of publishing twice.
      idempotencyKey: `article-delivery:${article.id}:${dto.credentialId}:${article.updatedAt.getTime()}`,
      platform,
      provenance: { source: 'article', sourceArticleId: article.id },
      title: article.label.trim() || 'Untitled',
    });

    if (!ArticleFilterUtil.isPublicArticleStatus(article.status)) {
      await this.articlesService.update(
        article.id,
        { status: ArticleStatus.PUBLISHED },
        ctx.userId,
        ctx.organizationId,
        ctx.brandId,
      );
    }

    return release;
  }

  /**
   * Deliver a newsletter issue to a connected Beehiiv publication: send now
   * (and publish it in the workspace, which adds it to the Substack import
   * feed), create a Beehiiv draft, or schedule the send.
   */
  async deliverNewsletter(
    ctx: LongFormDeliveryContext,
    newsletterId: string,
    dto: CreateNewsletterDeliveryDto,
  ): Promise<IReleaseGroup> {
    const newsletter = await this.newslettersService.findOneScoped(
      newsletterId,
      ctx,
    );
    if (!newsletter.brandId) {
      throw new BadRequestException(
        'Newsletter must belong to a brand before it can be delivered',
      );
    }

    const markdown = newsletter.content?.trim();
    if (!markdown) {
      throw new BadRequestException(
        'Newsletter must have content before it can be delivered',
      );
    }

    const scheduledDate =
      dto.mode === 'schedule'
        ? this.parseFutureDate(dto.scheduledDate)
        : undefined;

    const platform = await this.resolveDeliveryPlatform(
      ctx.organizationId,
      newsletter.brandId,
      dto.credentialId,
      isNewsletterDeliveryPlatform,
      'a connected Beehiiv publication',
    );

    const release = await this.queueRelease(ctx, {
      baseContent: renderNewsletterHtml(markdown),
      brandId: newsletter.brandId,
      credentialId: dto.credentialId,
      idempotencyKey: [
        'newsletter-delivery',
        newsletter.id,
        dto.credentialId,
        dto.mode,
        newsletter.updatedAt.getTime(),
        scheduledDate?.getTime(),
      ]
        .filter((part) => part !== undefined)
        .join(':'),
      platform,
      provenance: { source: 'newsletter', sourceNewsletterId: newsletter.id },
      scheduledDate,
      settings: {
        providerStatus: dto.mode === 'draft' ? 'draft' : 'confirmed',
      },
      title: newsletter.label.trim() || 'Untitled',
    });

    if (
      dto.mode === 'send' &&
      newsletter.status !== NEWSLETTER_PUBLISHED_STATUS
    ) {
      await this.newslettersService.publishScoped(newsletter.id, ctx);
    }

    if (scheduledDate) {
      await this.prisma.newsletter.updateMany({
        data: { scheduledFor: scheduledDate },
        where: scopedWhere(ctx.organizationId, { id: newsletter.id }),
      });
    }

    return release;
  }

  /** Delivery targets of an article the caller's organization owns, newest first. */
  async listArticleDeliveries(
    organizationId: string,
    articleId: string,
  ): Promise<IChannelTarget[]> {
    const article = await this.prisma.article.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, { id: articleId }),
    });
    if (!article) {
      throw new NotFoundException('Article', articleId);
    }
    return this.listDeliveries(organizationId, { articleId: article.id });
  }

  /** Delivery targets of a newsletter the caller's organization owns, newest first. */
  async listNewsletterDeliveries(
    organizationId: string,
    newsletterId: string,
  ): Promise<IChannelTarget[]> {
    const newsletter = await this.prisma.newsletter.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, { id: newsletterId }),
    });
    if (!newsletter) {
      throw new NotFoundException('Newsletter', newsletterId);
    }
    return this.listDeliveries(organizationId, {
      newsletterId: newsletter.id,
    });
  }

  private async listDeliveries(
    organizationId: string,
    source: LongFormDeliverySource,
  ): Promise<IChannelTarget[]> {
    const releases = await this.postGroupsService.listSourceReleases(
      organizationId,
      source,
    );
    return releases.flatMap((release) => release.targets);
  }

  /**
   * The credential must be one of the source brand's accounts on a delivery
   * platform. Connection state and readiness are enforced by the scheduler
   * when the release is created and queued.
   */
  private async resolveDeliveryPlatform(
    organizationId: string,
    brandId: string,
    credentialId: string,
    isAllowedPlatform: (platform: string | undefined) => boolean,
    expectedAccount: string,
  ): Promise<string> {
    const credential = await this.prisma.credential.findFirst({
      select: { id: true, platform: true },
      where: scopedWhere(organizationId, { brandId, id: credentialId }),
    });
    if (!credential) {
      throw new NotFoundException('Credential', credentialId);
    }

    const platform = fromPrismaCredentialPlatform(credential.platform);
    if (!platform || !isAllowedPlatform(platform)) {
      throw new BadRequestException(`Choose ${expectedAccount} of this brand.`);
    }
    return platform;
  }

  /**
   * Create the one-target release and queue it: immediately through
   * publish-now, or at `scheduledDate` through the scheduled path. An
   * idempotent replay of a release that already left draft is returned as is.
   */
  private async queueRelease(
    ctx: LongFormDeliveryContext,
    delivery: DeliveryRelease,
  ): Promise<IReleaseGroup> {
    const release = await this.postGroupsService.create(
      ctx.organizationId,
      ctx.userId,
      {
        baseContent: delivery.baseContent,
        brandId: delivery.brandId,
        idempotencyKey: delivery.idempotencyKey,
        ...(delivery.scheduledDate
          ? {
              scheduledDate: delivery.scheduledDate.toISOString(),
              status: ReleaseStatus.SCHEDULED,
            }
          : { status: ReleaseStatus.DRAFT }),
        targets: [
          {
            credentialId: delivery.credentialId,
            platform: delivery.platform,
            ...(delivery.settings ? { settings: delivery.settings } : {}),
          },
        ],
        timezone: 'UTC',
        title: delivery.title,
      },
      undefined,
      delivery.provenance,
    );

    if (release.status !== ReleaseStatus.DRAFT) {
      return release;
    }

    return this.postGroupsService.publishNow(
      ctx.organizationId,
      ctx.userId,
      release.id,
    );
  }

  private parseFutureDate(value: string | undefined): Date {
    const date = value ? new Date(value) : undefined;
    if (!date || Number.isNaN(date.getTime()) || date <= new Date()) {
      throw new BadRequestException(
        'Choose a future send time to schedule the newsletter.',
      );
    }
    return date;
  }
}
