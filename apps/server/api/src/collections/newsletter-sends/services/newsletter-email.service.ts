import type {
  NewsletterEmailBrand,
  NewsletterEmailContent,
  NewsletterEmailFooter,
  NewsletterEmailTemplate,
} from '@api/collections/newsletter-sends/interfaces/newsletter-email.interface';
import {
  NewsletterSettingsService,
  type NewsletterSettingsView,
} from '@api/collections/newsletter-sends/services/newsletter-settings.service';
import {
  markdownToPlainText,
  personalizeNewsletterEmail,
  previewMarkdown,
  renderNewsletterEmail,
} from '@api/collections/newsletter-sends/utils/newsletter-email-template.util';
import {
  createNewsletterToken,
  type NewsletterTokenPurpose,
  readNewsletterToken,
} from '@api/collections/newsletter-sends/utils/newsletter-token.util';
import { renderNewsletterHtml } from '@api/collections/newsletters/utils/newsletter-html.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { NEWSLETTER_ATTRIBUTION_SOURCE } from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

const TRAILING_SLASHES_PATTERN = /\/+$/;

/** Brand row columns the email layout reads. */
const BRAND_LOOK_SELECT = {
  backgroundColor: true,
  id: true,
  label: true,
  organizationId: true,
  primaryColor: true,
  slug: true,
} as const;

export interface NewsletterBrandLook {
  brandId: string;
  organizationId: string;
  slug: string;
  brand: NewsletterEmailBrand;
  footer: NewsletterEmailFooter;
  settings: NewsletterSettingsView;
  /** Inbox display name: the sender name, else the brand label. */
  fromName: string;
}

export interface NewsletterIssueSource {
  id: string;
  label: string;
  summary: string | null;
  content: string | null;
}

export interface NewsletterDeliveryInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  look: NewsletterBrandLook;
  unsubscribeUrl?: string;
}

/**
 * Renders and delivers newsletter mail in the brand's look (#9725), and owns
 * the public URLs every email links to. Delivery goes through the
 * notifications app, the only holder of the email provider key.
 */
@Traced()
@Injectable()
export class NewsletterEmailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: NewsletterSettingsService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  async getBrandLook(
    organizationId: string,
    brandId: string,
  ): Promise<NewsletterBrandLook> {
    const brand = await this.prisma.brand.findFirst({
      select: BRAND_LOOK_SELECT,
      where: { id: brandId, isDeleted: false, organizationId },
    });
    if (!brand) throw new NotFoundException('Brand', brandId);
    const [settings, assets] = await Promise.all([
      this.settings.get(organizationId, brandId),
      this.prisma.asset.findMany({
        distinct: ['category'],
        orderBy: { updatedAt: 'desc' },
        select: { category: true },
        where: {
          category: { in: ['LOGO', 'BANNER'] },
          isDeleted: false,
          parentBrandId: brandId,
          parentOrgId: organizationId,
          parentType: 'BRAND',
        },
      }),
    ]);
    const categories = new Set(assets.map((asset) => String(asset.category)));
    return {
      brand: {
        backgroundColor: brand.backgroundColor,
        bannerUrl: categories.has('BANNER')
          ? this.brandAssetUrl(brandId, 'banner')
          : null,
        label: brand.label,
        logoUrl: categories.has('LOGO')
          ? this.brandAssetUrl(brandId, 'logo')
          : null,
        primaryColor: brand.primaryColor,
      },
      brandId,
      footer: {
        attributionUrl: this.attributionUrl(brand.slug),
        footerText: settings.footerText,
        isAttributionEnabled: settings.isAttributionEnabled,
        postalAddress: settings.postalAddress,
        senderName: settings.senderName ?? brand.label,
      },
      fromName: settings.senderName?.trim() || brand.label,
      organizationId,
      settings,
      slug: brand.slug,
    };
  }

  /**
   * The issue email. `isPreview` renders the free preview of a gated issue
   * with a link to read the rest (#9718).
   */
  renderIssue(
    look: NewsletterBrandLook,
    issue: NewsletterIssueSource,
    isPreview = false,
    web?: { isWebVersion: true; subscribeUrl: string },
  ): NewsletterEmailTemplate {
    const markdown = issue.content ?? '';
    const body = isPreview ? previewMarkdown(markdown) : markdown;
    const webUrl = this.issueWebUrl(issue.id);
    const cta = !isPreview
      ? null
      : web
        ? { label: 'Subscribe to read the full issue', url: web.subscribeUrl }
        : { label: 'Read the full issue', url: webUrl };
    const content: NewsletterEmailContent = {
      bodyHtml: renderNewsletterHtml(body),
      bodyText: markdownToPlainText(body),
      cta,
      isWebVersion: web?.isWebVersion === true,
      summary: issue.summary,
      title: issue.label,
      webUrl: web ? null : webUrl,
    };
    return renderNewsletterEmail(look.brand, content, look.footer);
  }

  renderMessage(
    look: NewsletterBrandLook,
    message: {
      title: string;
      markdown: string;
      cta?: { label: string; url: string } | null;
    },
  ): NewsletterEmailTemplate {
    return renderNewsletterEmail(
      look.brand,
      {
        bodyHtml: renderNewsletterHtml(message.markdown),
        bodyText: markdownToPlainText(message.markdown),
        cta: message.cta ?? null,
        title: message.title,
      },
      look.footer,
    );
  }

  /** Send one rendered email; returns the provider message id. */
  async deliver(input: NewsletterDeliveryInput): Promise<string> {
    const replyTo = input.look.settings.replyTo?.trim();
    return this.notifications.deliverEmail({
      fromName: input.look.fromName,
      html: input.html,
      idempotencyKey: input.idempotencyKey,
      subject: input.subject,
      text: input.text,
      to: input.to,
      ...(replyTo ? { replyTo } : {}),
      ...(input.unsubscribeUrl
        ? {
            headers: {
              'List-Unsubscribe': `<${input.unsubscribeUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          }
        : {}),
    });
  }

  /** Fill a template for one subscriber, with no click tracking. */
  personalizeForSubscriber(
    template: NewsletterEmailTemplate,
    subscriberId: string,
  ): { html: string; text: string; unsubscribeUrl: string } {
    const unsubscribeUrl = this.unsubscribeUrl(subscriberId);
    return {
      ...personalizeNewsletterEmail(template, {
        linkUrl: (index) => template.links[index] ?? this.publicSiteUrl(),
        unsubscribeUrl,
      }),
      unsubscribeUrl,
    };
  }

  unsubscribeUrl(subscriberId: string): string {
    return `${this.apiV1()}/public/newsletter/unsubscribe/${this.sign('unsubscribe', subscriberId)}`;
  }

  clickUrl(recipientId: string, index: number): string {
    return `${this.apiV1()}/public/newsletter/c/${this.sign('click', `${recipientId}-${index}`)}`;
  }

  confirmUrl(rawToken: string): string {
    return `${this.apiV1()}/public/newsletter/confirm/${rawToken}`;
  }

  issueWebUrl(newsletterId: string): string {
    return `${this.apiV1()}/public/newsletter/issues/${newsletterId}`;
  }

  brandAssetUrl(brandId: string, role: 'logo' | 'banner'): string {
    return `${this.apiV1()}/public/newsletter/brands/${brandId}/${role}`;
  }

  publicSiteUrl(): string {
    return (
      this.config.get('GENFEEDAI_PUBLIC_URL')?.trim() || 'https://genfeed.ai'
    ).replace(TRAILING_SLASHES_PATTERN, '');
  }

  readToken(purpose: NewsletterTokenPurpose, token: string): string | null {
    return readNewsletterToken(this.signingKey(), purpose, token);
  }

  private sign(purpose: NewsletterTokenPurpose, subject: string): string {
    return createNewsletterToken(this.signingKey(), purpose, subject);
  }

  private signingKey(): string {
    return this.config.get('TOKEN_ENCRYPTION_KEY') ?? '';
  }

  private attributionUrl(brandSlug: string): string {
    const url = new URL(this.publicSiteUrl());
    url.searchParams.set('utm_source', NEWSLETTER_ATTRIBUTION_SOURCE);
    url.searchParams.set('utm_medium', 'email');
    url.searchParams.set('utm_campaign', brandSlug);
    return url.toString();
  }

  private apiV1(): string {
    const base = this.config.apiUrl.replace(TRAILING_SLASHES_PATTERN, '');
    return base.endsWith('/v1') ? base : `${base}/v1`;
  }
}
