import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { AssetDocument } from '@api/collections/assets/schemas/asset.schema';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { ValidationException } from '@api/exceptions/validation.exception';
import { returnNotFound } from '@api/helpers/utils/response/response.util';
import { CacheService } from '@api/services/cache/cache.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AssetCategory,
  AssetParent,
  ModelCategory,
} from '@genfeedai/contracts';
import { LOWEST_COST_IMAGE_MODEL_KEY } from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const LOGO_SIZE_PX = 1024;
const MAX_DESCRIPTION_LENGTH = 500;

/**
 * Generates an organization logo from a fixed preset. There is no free-form
 * prompt: the prompt is built from the organization label plus the description
 * seeded into its default brand (organizations have no description column).
 *
 * Mirrors the brand logo flow in `AssetsOperationsController.generate`: an
 * `Asset` (parentType ORGANIZATION, category LOGO) is created, a Replicate
 * text-to-image prediction is started and its id stored as `externalId`. The
 * Replicate webhook later uploads the output to the asset, after which
 * `OrganizationLogoService` resolves it like an uploaded logo.
 */
@Injectable()
export class OrganizationLogoGenerationService {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly cacheService: CacheService,
    private readonly loggerService: LoggerService,
    private readonly organizationsService: OrganizationsService,
    private readonly prisma: PrismaService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly replicateService: ReplicateService,
  ) {}

  async generate(organizationId: string, user: User): Promise<AssetDocument> {
    const organization = await this.organizationsService.findOne({
      id: organizationId,
      isDeleted: false,
    });

    if (!organization) {
      return returnNotFound('Organization', organizationId);
    }

    const description = await this.resolveDescription(organizationId);
    const prompt = this.buildPrompt(organization.label, description);
    const userId = user.userId ?? user.id;

    const asset = await this.assetsService.create({
      category: AssetCategory.LOGO,
      parentId: organizationId,
      parentOrgId: organizationId,
      parentType: AssetParent.ORGANIZATION,
      userId,
    });

    try {
      const { input } = await this.promptBuilderService.buildPrompt(
        LOWEST_COST_IMAGE_MODEL_KEY,
        {
          height: LOGO_SIZE_PX,
          modelCategory: ModelCategory.IMAGE,
          prompt,
          style: 'natural',
          width: LOGO_SIZE_PX,
        },
        organizationId,
      );

      const generationId = await this.replicateService.generateTextToImage(
        LOWEST_COST_IMAGE_MODEL_KEY,
        input,
      );

      if (!generationId) {
        throw new ValidationException('Failed to start image generation');
      }

      await this.assetsService.patch(asset.id, { externalId: generationId });

      this.loggerService.log(
        'OrganizationLogoGenerationService generation started',
        { assetId: asset.id, generationId, organizationId },
      );
    } catch (error: unknown) {
      // Drop the placeholder so it never shadows the current logo, and let the
      // error surface before the credits interceptor charges the organization.
      await this.assetsService.remove(asset.id);
      throw error;
    }

    // One logo per organization: the new one replaces the previous, but only
    // once generation has actually started so a failure keeps the current logo.
    await this.assetsService.patchAll(
      {
        category: AssetCategory.LOGO,
        id: { not: asset.id },
        parentOrgId: organizationId,
        parentType: AssetParent.ORGANIZATION,
      },
      { isDeleted: true },
    );
    await this.cacheService.invalidateByTags(['organizations']);

    return asset;
  }

  private async resolveDescription(
    organizationId: string,
  ): Promise<string | undefined> {
    const brand = await this.prisma.brand.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { description: true },
      where: {
        description: { not: null },
        isDeleted: false,
        organizationId,
      },
    });

    const description = brand?.description?.trim();
    return description
      ? description.slice(0, MAX_DESCRIPTION_LENGTH)
      : undefined;
  }

  private buildPrompt(label: string, description?: string): string {
    const parts = [
      `Generate a professional logo (${LOGO_SIZE_PX}x${LOGO_SIZE_PX}) for ${label}`,
    ];

    if (description) {
      parts.push(description);
    }

    parts.push('Style: modern, clean, professional');

    return parts.join('. ');
  }
}
