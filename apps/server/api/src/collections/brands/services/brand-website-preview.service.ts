import { BrandScraperService } from '@api/services/brand-scraper/brand-scraper.service';
import type { IScrapedBrandData } from '@genfeedai/interfaces';
import { BadRequestException, Injectable } from '@nestjs/common';

export interface BrandWebsitePreviewData {
  description?: string;
  label?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  slug?: string;
  sourceUrl: string;
  websiteUrl: string;
}

export interface BrandWebsitePreviewResponse {
  data: BrandWebsitePreviewData;
}

@Injectable()
export class BrandWebsitePreviewService {
  constructor(private readonly brandScraperService: BrandScraperService) {}

  async previewWebsite(
    websiteUrl: string,
  ): Promise<BrandWebsitePreviewResponse> {
    try {
      const scraped = await this.brandScraperService.scrapeWebsite(websiteUrl);
      return this.mapPreview(scraped);
    } catch (error: unknown) {
      throw new BadRequestException(
        this.readErrorMessage(error) ||
          'Could not load brand data from that website',
      );
    }
  }

  private mapPreview(scraped: IScrapedBrandData): BrandWebsitePreviewResponse {
    const label = this.selectFirstNonEmpty(
      scraped.companyName,
      scraped.tagline,
      scraped.heroText,
    );
    const description = this.selectFirstNonEmpty(
      scraped.description,
      scraped.metaDescription,
      scraped.aboutText,
      scraped.tagline,
    );
    const slug = this.slugifyBrandLabel(label ?? '');

    return {
      data: {
        description,
        label,
        // A social preview is not a company logo. The scraper's logoUrl has
        // already resolved DOM logo → Logo.dev when a company logo is available.
        logoUrl: scraped.logoUrl || undefined,
        primaryColor: scraped.primaryColor || undefined,
        secondaryColor: scraped.secondaryColor || undefined,
        slug: slug || undefined,
        sourceUrl: scraped.sourceUrl,
        websiteUrl: scraped.sourceUrl,
      },
    };
  }

  private selectFirstNonEmpty(
    ...candidates: (string | undefined)[]
  ): string | undefined {
    for (const candidate of candidates) {
      const value = candidate?.trim();
      if (value) {
        return value;
      }
    }

    return undefined;
  }

  private slugifyBrandLabel(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private readErrorMessage(error: unknown): string | undefined {
    if (typeof error !== 'object' || error === null || !('message' in error)) {
      return undefined;
    }

    return typeof error.message === 'string' ? error.message : undefined;
  }
}
