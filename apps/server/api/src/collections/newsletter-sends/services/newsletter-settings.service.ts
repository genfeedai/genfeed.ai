import type { UpdateNewsletterSettingsDto } from '@api/collections/newsletter-sends/dto/update-newsletter-settings.dto';
import { NewsletterUsageService } from '@api/collections/newsletter-sends/services/newsletter-usage.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type { NewsletterSettings } from '@genfeedai/prisma';
import { Traced } from '@libs/tracing/traced';
import { ForbiddenException, Injectable } from '@nestjs/common';

/** Defaults a brand gets before it saves any newsletter settings. */
export type NewsletterSettingsView = Omit<
  NewsletterSettings,
  'createdAt' | 'updatedAt' | 'id'
> & { id: string | null };

@Traced()
@Injectable()
export class NewsletterSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: NewsletterUsageService,
  ) {}

  /** The brand's settings, or unsaved defaults. Caller has checked brand access. */
  async get(
    organizationId: string,
    brandId: string,
  ): Promise<NewsletterSettingsView> {
    const saved = await this.prisma.newsletterSettings.findFirst({
      where: scopedWhere(organizationId, { brandId }),
    });
    if (saved) return saved;
    return {
      brandId,
      footerText: null,
      id: null,
      isAttributionEnabled: true,
      isDeleted: false,
      isWelcomeEnabled: false,
      organizationId,
      paidPriceCredits: null,
      postalAddress: null,
      replyTo: null,
      senderName: null,
      welcomeBody: null,
      welcomeSubject: null,
    };
  }

  async update(
    organizationId: string,
    brandId: string,
    dto: UpdateNewsletterSettingsDto,
  ): Promise<NewsletterSettings> {
    if (
      dto.isAttributionEnabled === false &&
      !(await this.usage.canRemoveAttribution(organizationId))
    ) {
      throw new ForbiddenException({
        code: 'NEWSLETTER_ATTRIBUTION_PLAN',
        message: 'Removing "Sent with Genfeed" needs a paid plan.',
      });
    }
    const data = {
      footerText: dto.footerText,
      isAttributionEnabled: dto.isAttributionEnabled,
      isWelcomeEnabled: dto.isWelcomeEnabled,
      paidPriceCredits: dto.paidPriceCredits,
      postalAddress: dto.postalAddress,
      replyTo: dto.replyTo,
      senderName: dto.senderName,
      welcomeBody: dto.welcomeBody,
      welcomeSubject: dto.welcomeSubject,
    };
    const existing = await this.prisma.newsletterSettings.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, { brandId }),
    });
    if (existing) {
      // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere pins the brand's single settings row inside its organization.
      await this.prisma.newsletterSettings.updateMany({
        data,
        where: scopedWhere(organizationId, { id: existing.id }),
      });
    } else {
      await this.prisma.newsletterSettings.create({
        data: { ...data, brandId, organizationId },
      });
    }
    const saved = await this.prisma.newsletterSettings.findFirst({
      where: scopedWhere(organizationId, { brandId }),
    });
    if (!saved) throw new Error('Newsletter settings were not saved');
    return saved;
  }
}
