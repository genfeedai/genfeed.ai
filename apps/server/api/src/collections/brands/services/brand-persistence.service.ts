import type { UpdateBrandDto } from '@api/collections/brands/dto/update-brand.dto';
import { BrandDataMapper } from '@api/collections/brands/services/brand-data.mapper';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { LinksService } from '@api/collections/links/services/links.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { BrandSetupDto } from '@api/endpoints/onboarding/dto/brand-setup.dto';
import type { ReferenceImageDto } from '@api/endpoints/onboarding/dto/reference-images.dto';
import { LinkCategory } from '@genfeedai/enums';
import type {
  IExtractedBrandData,
  IScrapedBrandData,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/**
 * BrandPersistenceService
 *
 * Owns every brand/org write performed during the brand-setup flow: scraped-data
 * updates, website-link upserts, canonical guidance merges, reference images,
 * and the single label→slug sync used by all brand-setup flows.
 *
 * Brand-domain: owned by `BrandsModule`. Dissolved out of the onboarding
 * endpoint per REST audit #1354 so the OnboardingModule ↔ BrandsModule import
 * cycle disappears.
 */
@Injectable()
export class BrandPersistenceService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly brandsService: BrandsService,
    private readonly linksService: LinksService,
    private readonly organizationsService: OrganizationsService,
    private readonly brandDataMapper: BrandDataMapper,
  ) {}

  /**
   * Update brand entity with scraped data
   */
  async updateBrandWithScrapedData(
    brandId: string,
    scrapedData: IScrapedBrandData,
    dto: BrandSetupDto,
    labelOverride?: string,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};

    const label = labelOverride || scrapedData.companyName;
    if (label) {
      updateData.label = label;
    }

    if (scrapedData.description) {
      updateData.description = scrapedData.description;
    }

    if (scrapedData.primaryColor) {
      updateData.primaryColor = scrapedData.primaryColor;
    }

    if (scrapedData.secondaryColor) {
      updateData.secondaryColor = scrapedData.secondaryColor;
    }

    if (scrapedData.fontFamily) {
      updateData.fontFamily = scrapedData.fontFamily;
    }

    // Build system prompt from scraped content
    if (scrapedData.tagline || scrapedData.aboutText) {
      const systemPromptParts: string[] = [];

      if (scrapedData.companyName) {
        systemPromptParts.push(
          `You are creating content for ${scrapedData.companyName}.`,
        );
      }

      if (scrapedData.tagline) {
        systemPromptParts.push(`Brand tagline: "${scrapedData.tagline}"`);
      }

      if (scrapedData.aboutText) {
        systemPromptParts.push(`About the brand: ${scrapedData.aboutText}`);
      }

      if (dto.industry) {
        systemPromptParts.push(`Industry: ${dto.industry}`);
      }

      if (dto.targetAudience) {
        systemPromptParts.push(`Target audience: ${dto.targetAudience}`);
      }

      updateData.text = systemPromptParts.join('\n\n');
    }

    if (Object.keys(updateData).length > 0) {
      await this.brandsService.patch(
        brandId,
        updateData as Partial<UpdateBrandDto>,
      );
    }
  }

  async upsertBrandWebsiteLink(
    brandId: string,
    websiteUrl: string,
  ): Promise<void> {
    const normalizedUrl = websiteUrl.trim();

    if (!normalizedUrl) {
      return;
    }

    const existingWebsiteLink = await this.linksService.findOne({
      brand: brandId,
      category: LinkCategory.WEBSITE,
      isDeleted: false,
    });

    if (existingWebsiteLink) {
      await this.linksService.patch(String(existingWebsiteLink.id), {
        label: 'Website',
        url: normalizedUrl,
      });
      return;
    }

    await this.linksService.create({
      brand: brandId,
      category: LinkCategory.WEBSITE,
      label: 'Website',
      url: normalizedUrl,
    });
  }

  async updateBrandGuidance(
    brandId: string,
    extractedData: IExtractedBrandData,
  ): Promise<void> {
    const brand = await this.brandsService.findOne({
      _id: brandId,
      isDeleted: false,
    });

    if (!brand) {
      return;
    }

    const brandAgentConfig = this.brandDataMapper.readBrandAgentConfig(
      brand.agentConfig,
    );

    await this.brandsService.patch(brandId, {
      agentConfig: this.brandDataMapper.mergeExtractedVoice(
        brandAgentConfig,
        extractedData,
      ),
    });
  }

  /**
   * Sync the organization label and slug from a brand label.
   * Single canonical implementation of the previously-triplicated block.
   */
  async syncOrgLabelAndSlug(
    label: string,
    organizationId: string,
  ): Promise<void> {
    const orgSlug = await this.organizationsService.generateUniqueSlug(
      label,
      organizationId,
    );
    await this.organizationsService.patch(organizationId, {
      label,
      slug: orgSlug,
    });
  }

  /**
   * Sync organization label/slug and the brand slug from a brand label.
   */
  async syncBrandAndOrgSlug(
    label: string,
    organizationId: string,
    brandId: string,
  ): Promise<void> {
    await this.syncOrgLabelAndSlug(label, organizationId);

    const brandSlug = await this.brandsService.generateUniqueSlug(
      label,
      brandId,
    );
    await this.brandsService.patch(brandId, { slug: brandSlug });
  }

  /**
   * Add reference images to a brand
   */
  async addReferenceImages(
    brandId: string,
    images: ReferenceImageDto[],
    organizationId: string,
  ): Promise<{ success: boolean; count: number }> {
    const caller = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${caller} starting`, { brandId });

    const brand = await this.brandsService.findOne(
      {
        _id: brandId,
        isDeleted: false,
        organization: organizationId,
      },
      'none',
    );

    if (!brand) {
      throw new HttpException(
        { detail: 'Brand not found', title: 'Not Found' },
        HttpStatus.NOT_FOUND,
      );
    }

    const brandId_str = String(
      (brand as Record<string, unknown>).id ?? brand.id,
    );
    const existingImages = this.brandDataMapper.readBrandReferenceImages(
      brand.referenceImages,
    );
    await this.brandsService.patch(brandId_str, {
      referenceImages: [
        ...existingImages,
        ...images.map((image) => ({
          category: image.category,
          isDefault: image.isDefault,
          label: image.label,
          url: image.url,
        })),
      ],
    });

    this.loggerService.log(`${caller} completed`, {
      brandId,
      count: images.length,
    });

    return { count: images.length, success: true };
  }
}
