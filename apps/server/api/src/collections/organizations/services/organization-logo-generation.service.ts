import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ASSET_ORIGIN_GENERATION_PENDING } from '@api/collections/assets/constants/asset-origin.constant';
import type { AssetDocument } from '@api/collections/assets/schemas/asset.schema';
import { AssetsService } from '@api/collections/assets/services/assets.service';
import { PRISMA_ASSET_CATEGORY_BY_ROLE } from '@api/collections/brands/constants/brand-kit-assets.constant';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { ValidationException } from '@api/exceptions/validation.exception';
import { returnNotFound } from '@api/helpers/utils/response/response.util';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AssetCategory,
  AssetParent,
  ModelCategory,
} from '@genfeedai/contracts';
import { LOWEST_COST_IMAGE_MODEL_KEY } from '@genfeedai/contracts/constants';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { ConflictException, Injectable } from '@nestjs/common';

const LOGO_SIZE_PX = 1024;
const MAX_DESCRIPTION_LENGTH = 500;
/** A generation still pending after this long is treated as abandoned. */
const PENDING_GENERATION_TTL_MS = 10 * 60 * 1000;

/**
 * Generates an organization logo from a fixed preset. There is no free-form
 * prompt: the prompt is built from the organization label plus the description
 * seeded into its default brand (organizations have no description column).
 *
 * Mirrors the brand logo flow in `AssetsOperationsController.generate`: an
 * `Asset` (parentType ORGANIZATION, category LOGO) is created, a Replicate
 * text-to-image prediction is started and its id stored as `externalId`. The
 * Replicate webhook later uploads the output to the asset, clears the pending
 * origin marker, soft-deletes the previous logos and invalidates the
 * organizations cache. Until then the asset is invisible to
 * `OrganizationLogoService`, so the current logo stays in place (and stays if
 * generation fails).
 */
@Injectable()
export class OrganizationLogoGenerationService {
  constructor(
    private readonly assetsService: AssetsService,
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

    await this.assertNoPendingGeneration(organizationId);

    const description = await this.resolveDescription(organizationId);
    const prompt = this.buildPrompt(organization.label, description);
    const userId = user.userId ?? user.id;

    const assetInput = {
      category: AssetCategory.LOGO,
      origin: ASSET_ORIGIN_GENERATION_PENDING,
      parentId: organizationId,
      parentOrgId: organizationId,
      parentType: AssetParent.ORGANIZATION,
      userId,
    };
    const asset = await this.assetsService.create(assetInput);

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

    return asset;
  }

  /**
   * Rejects (409) a second generation while one is still in flight, so a
   * double click or retry can never be charged twice. Abandoned pending assets
   * (webhook never arrived) are retired first so they cannot block forever.
   */
  private async assertNoPendingGeneration(
    organizationId: string,
  ): Promise<void> {
    const pendingWhere = {
      category: PRISMA_ASSET_CATEGORY_BY_ROLE.logo,
      isDeleted: false,
      origin: ASSET_ORIGIN_GENERATION_PENDING,
      parentOrgId: organizationId,
      parentType:
        AssetParent.ORGANIZATION as Prisma.AssetCreateInput['parentType'],
    };
    const cutoff = new Date(Date.now() - PENDING_GENERATION_TTL_MS);

    await this.prisma.asset.updateMany({
      data: { isDeleted: true },
      where: { ...pendingWhere, createdAt: { lt: cutoff } },
    });

    const pending = await this.prisma.asset.findFirst({
      select: { id: true },
      where: pendingWhere,
    });

    if (pending) {
      throw new ConflictException(
        'An organization logo is already being generated',
      );
    }
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
