import { BrandKitAssetsService } from '@api/collections/brands/services/brand-kit-assets.service';
import { NewsletterEmailService } from '@api/collections/newsletter-sends/services/newsletter-email.service';
import {
  markdownToPlainText,
  personalizeNewsletterEmail,
  previewMarkdown,
} from '@api/collections/newsletter-sends/utils/newsletter-email-template.util';
import { renderNewsletterHtml } from '@api/collections/newsletters/utils/newsletter-html.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  creatorProfilePath,
  isNewsletterAccessLevel,
} from '@genfeedai/contracts/constants';
import type {
  IPublicNewsletterArchive,
  IPublicNewsletterBrand,
  IPublicNewsletterIssue,
  IPublicNewsletterIssueSummary,
} from '@genfeedai/contracts/interfaces';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

const CLICK_SUBJECT_PATTERN = /^([a-z0-9]+)-(\d{1,4})$/;
const ENTITY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const ARCHIVE_PAGE_SIZE = 20;
const WORDS_PER_MINUTE = 220;
const WORD_PATTERN = /\S+/g;

const PUBLISHED_ISSUE_WHERE = {
  content: { not: null },
  isDeleted: false,
  publishedAt: { not: null },
  status: 'published',
} as const;

const ISSUE_SELECT = {
  accessLevel: true,
  content: true,
  id: true,
  label: true,
  publishedAt: true,
  summary: true,
} as const;

interface PublishedIssueRow {
  accessLevel: string;
  content: string | null;
  id: string;
  label: string;
  publishedAt: Date | null;
  summary: string | null;
}

function toIssueSummary(row: PublishedIssueRow): IPublicNewsletterIssueSummary {
  const words = markdownToPlainText(row.content ?? '').match(WORD_PATTERN);
  return {
    accessLevel: isNewsletterAccessLevel(row.accessLevel)
      ? row.accessLevel
      : 'public',
    id: row.id,
    publishedAt: (row.publishedAt ?? new Date(0)).toISOString(),
    readingMinutes: Math.max(
      1,
      Math.ceil((words?.length ?? 0) / WORDS_PER_MINUTE),
    ),
    subject: row.label,
    summary: row.summary,
  };
}

/**
 * Public, unauthenticated newsletter surfaces: tracked link redirects,
 * one-click unsubscribe, brand images for the email header and the browser
 * version of an issue. Every capability is a signed token or a published
 * record; nothing redirects to a caller-supplied URL.
 */
@Traced()
@Injectable()
export class NewsletterPublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: NewsletterEmailService,
    private readonly brandKitAssets: BrandKitAssetsService,
  ) {}

  /** Record a first-party click and return the stored destination. */
  async trackClick(token: string): Promise<string> {
    const subject = this.emails.readToken('click', token);
    const match = subject ? CLICK_SUBJECT_PATTERN.exec(subject) : null;
    if (!match?.[1] || !match[2])
      throw new NotFoundException('Newsletter link');
    const recipientId = match[1];
    const linkIndex = Number(match[2]);
    // tenant-scope-ignore: the signed token names one recipient; its organization is read from the row.
    const recipient = await this.prisma.newsletterSendRecipient.findFirst({
      select: {
        id: true,
        organizationId: true,
        send: { select: { id: true, links: true } },
      },
      where: { id: recipientId, isDeleted: false },
    });
    const links = Array.isArray(recipient?.send.links)
      ? recipient.send.links
      : [];
    const destination = links[linkIndex];
    if (!recipient || typeof destination !== 'string') {
      throw new NotFoundException('Newsletter link');
    }
    const orgId = recipient.organizationId;
    const occurredAt = new Date();
    await this.prisma.$transaction([
      this.prisma.newsletterLinkClick.create({
        data: {
          linkIndex,
          occurredAt,
          organizationId: orgId,
          recipientId: recipient.id,
          sendId: recipient.send.id,
        },
      }),
      // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere pins one recipient inside its organization.
      this.prisma.newsletterSendRecipient.updateMany({
        data: { clickCount: { increment: 1 } },
        where: scopedWhere(orgId, { id: recipient.id }),
      }),
      // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere pins one recipient inside its organization; the null predicate keeps the first click.
      this.prisma.newsletterSendRecipient.updateMany({
        data: { clickedAt: occurredAt },
        where: scopedWhere(orgId, { clickedAt: null, id: recipient.id }),
      }),
    ]);
    return destination;
  }

  /**
   * Unsubscribe the subscriber a signed link names. Idempotent; returns the
   * brand name for the confirmation page, or null for an invalid link.
   */
  async unsubscribe(token: string): Promise<string | null> {
    const subscriberId = this.emails.readToken('unsubscribe', token);
    if (!subscriberId) return null;
    // tenant-scope-ignore: the signed token names one subscriber; its organization is read from the row.
    const subscriber = await this.prisma.brandSubscriber.findFirst({
      select: {
        brand: { select: { label: true } },
        id: true,
        organizationId: true,
        status: true,
      },
      where: { id: subscriberId, isDeleted: false },
    });
    if (!subscriber) return null;
    const orgId = subscriber.organizationId;
    if (subscriber.status === 'active' || subscriber.status === 'pending') {
      const now = new Date();
      // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere pins one subscriber inside its organization.
      await this.prisma.brandSubscriber.updateMany({
        data: {
          confirmTokenHash: null,
          status: 'unsubscribed',
          unsubscribedAt: now,
        },
        where: scopedWhere(orgId, { id: subscriber.id }),
      });
      const latest = await this.prisma.newsletterSendRecipient.findFirst({
        orderBy: { sentAt: 'desc' },
        select: { id: true },
        where: scopedWhere(orgId, {
          sentAt: { not: null },
          subscriberId: subscriber.id,
        }),
      });
      if (latest) {
        // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere pins one recipient inside its organization.
        await this.prisma.newsletterSendRecipient.updateMany({
          data: { unsubscribedAt: now },
          where: scopedWhere(orgId, { id: latest.id, unsubscribedAt: null }),
        });
      }
    }
    return subscriber.brand.label;
  }

  /** Signed URL of the brand's logo or banner, for the email header. */
  async brandAssetUrl(
    brandId: string,
    role: 'logo' | 'banner',
  ): Promise<string> {
    if (!ENTITY_ID_PATTERN.test(brandId)) throw new NotFoundException('Image');
    // tenant-scope-ignore: brand images are public in the emails that embed them; the brand's organization is read from the row.
    const brand = await this.prisma.brand.findFirst({
      select: { id: true, organizationId: true },
      where: { id: brandId, isDeleted: false },
    });
    if (!brand) throw new NotFoundException('Image');
    const hasNewsletter = await this.prisma.brandSubscriber.findFirst({
      select: { id: true },
      where: scopedWhere(brand.organizationId, { brandId }),
    });
    if (!hasNewsletter) throw new NotFoundException('Image');
    const kit = await this.brandKitAssets.resolveBrandKitAssets(
      brand.id,
      brand.organizationId,
    );
    const url = kit[role]?.url;
    if (!url) throw new NotFoundException('Image');
    return url;
  }

  /** The browser version of a published issue, in the brand's look. */
  async renderIssuePage(newsletterId: string): Promise<string> {
    if (!ENTITY_ID_PATTERN.test(newsletterId)) {
      throw new NotFoundException('Newsletter', newsletterId);
    }
    // tenant-scope-ignore: only published issues are public; the organization is read from the row.
    const issue = await this.prisma.newsletter.findFirst({
      select: {
        accessLevel: true,
        brandId: true,
        content: true,
        id: true,
        label: true,
        organizationId: true,
        summary: true,
      },
      where: {
        content: { not: null },
        id: newsletterId,
        isDeleted: false,
        publishedAt: { not: null },
        status: 'published',
      },
    });
    if (!issue?.brandId || !issue.content?.trim()) {
      throw new NotFoundException('Newsletter', newsletterId);
    }
    const look = await this.emails.getBrandLook(
      issue.organizationId,
      issue.brandId,
    );
    const isGated = issue.accessLevel !== 'public';
    const template = this.emails.renderIssue(look, issue, isGated, {
      isWebVersion: true,
      subscribeUrl: `${this.emails.publicSiteUrl()}${creatorProfilePath(look.slug)}`,
    });
    return personalizeNewsletterEmail(template, {
      linkUrl: (index) => template.links[index] ?? '#',
      unsubscribeUrl: '#',
    }).html;
  }

  /** A brand's published issues, newest first, for its public archive (#9728). */
  async getArchive(
    brandId: string,
    page = 1,
  ): Promise<IPublicNewsletterArchive> {
    const brand = await this.findPublicBrand(brandId);
    const safePage = Number.isInteger(page) && page > 0 ? page : 1;
    // tenant-scope-ignore: published issues are public; the organization is read from the brand row.
    const rows = await this.prisma.newsletter.findMany({
      orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
      select: ISSUE_SELECT,
      skip: (safePage - 1) * ARCHIVE_PAGE_SIZE,
      take: ARCHIVE_PAGE_SIZE + 1,
      where: {
        ...PUBLISHED_ISSUE_WHERE,
        brandId: brand.id,
        organizationId: brand.organizationId,
      },
    });
    const issues = rows
      .slice(0, ARCHIVE_PAGE_SIZE)
      .filter((row) => row.content?.trim())
      .map(toIssueSummary);
    return {
      brand: { id: brand.id, label: brand.label, slug: brand.slug },
      hasMore: rows.length > ARCHIVE_PAGE_SIZE,
      issues,
    };
  }

  /**
   * One published issue as sanitized HTML. Issues for subscribers or paid
   * readers show only their free preview on the open web.
   */
  async getArchiveIssue(newsletterId: string): Promise<IPublicNewsletterIssue> {
    if (!ENTITY_ID_PATTERN.test(newsletterId)) {
      throw new NotFoundException('Newsletter', newsletterId);
    }
    // tenant-scope-ignore: only published issues are public; the organization is read from the row.
    const row = await this.prisma.newsletter.findFirst({
      select: { ...ISSUE_SELECT, brandId: true, organizationId: true },
      where: { ...PUBLISHED_ISSUE_WHERE, id: newsletterId },
    });
    if (!row?.brandId || !row.content?.trim()) {
      throw new NotFoundException('Newsletter', newsletterId);
    }
    const brand = await this.findPublicBrand(row.brandId);
    const summary = toIssueSummary(row);
    const isPreview = summary.accessLevel !== 'public';
    return {
      ...summary,
      brand: { id: brand.id, label: brand.label, slug: brand.slug },
      html: renderNewsletterHtml(
        isPreview ? previewMarkdown(row.content) : row.content,
      ),
      isPreview,
    };
  }

  private async findPublicBrand(
    brandId: string,
  ): Promise<IPublicNewsletterBrand & { organizationId: string }> {
    if (!ENTITY_ID_PATTERN.test(brandId)) {
      throw new NotFoundException('Newsletter', brandId);
    }
    // tenant-scope-ignore: a public archive names its brand; the organization is read from the row.
    const brand = await this.prisma.brand.findFirst({
      select: { id: true, label: true, organizationId: true, slug: true },
      where: { id: brandId, isDeleted: false },
    });
    if (!brand) throw new NotFoundException('Newsletter', brandId);
    return brand;
  }
}
