import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { HandleErrors } from '@api/helpers/decorators/error-handler.decorator';
import { MarketplaceApiClient } from '@api/marketplace-integration/marketplace-api-client';
import { ListingType, PromptCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

interface InstallResult {
  resourceId: string;
  resourceType: string;
  title: string;
}

/**
 * Prompt category mapping from marketplace prompt categories to PromptCategory enum.
 */
const PROMPT_CATEGORY_MAP: Record<string, PromptCategory> = {
  'image-generation': PromptCategory.PRESET_DESCRIPTION_IMAGE,
  'music-generation': PromptCategory.PRESET_DESCRIPTION_MUSIC,
  'video-generation': PromptCategory.PRESET_DESCRIPTION_VIDEO,
};

@Injectable()
export class MarketplaceInstallService {
  constructor(
    private readonly logger: LoggerService,
    private readonly marketplaceApiClient: MarketplaceApiClient,
    private readonly workflowsService: WorkflowsService,
    private readonly promptsService: PromptsService,
    private readonly skillsService: SkillsService,
  ) {}

  @HandleErrors('install to workspace', 'marketplace-install')
  async installToWorkspace(
    listingId: string,
    userId: string,
    organizationId: string,
  ): Promise<InstallResult> {
    const listingData =
      await this.marketplaceApiClient.getListingDownloadData(listingId);

    if (!listingData) {
      throw new NotFoundException('Listing not found');
    }

    const { downloadData, title, type } = listingData;

    switch (type) {
      case ListingType.WORKFLOW:
        return this.installWorkflow(
          downloadData,
          listingId,
          title,
          userId,
          organizationId,
        );

      case ListingType.PROMPT:
      case ListingType.PRESET:
        return this.installPrompt(downloadData, title, userId, organizationId);

      case ListingType.SKILL:
        return this.installSkill(
          downloadData,
          title,
          listingId,
          userId,
          organizationId,
        );

      default:
        throw new BadRequestException(`Unsupported listing type: ${type}`);
    }
  }

  private async installWorkflow(
    downloadData: Record<string, unknown>,
    listingId: string,
    title: string,
    userId: string,
    organizationId: string,
  ): Promise<InstallResult> {
    this.logger.log(
      `Installing workflow "${title}" for user ${userId}`,
      'MarketplaceInstallService',
    );

    const workflow = await this.workflowsService.createWorkflow(
      userId,
      organizationId,
      {
        // @ts-expect-error type cast
        edges:
          (downloadData.edges as unknown as Record<string, unknown>[]) || [],
        label: (downloadData.name as string) || title,
        metadata: {
          createdFrom: 'marketplace',
          sourceListingId: listingId,
          sourceType: 'marketplace-listing',
        },
        // @ts-expect-error type cast
        nodes:
          (downloadData.nodes as unknown as Record<string, unknown>[]) || [],
        // @ts-expect-error type cast
        trigger: 'manual',
      },
    );

    return {
      resourceId: workflow._id.toString(),
      resourceType: 'workflow',
      title: workflow.label || title,
    };
  }

  private async installPrompt(
    downloadData: Record<string, unknown>,
    title: string,
    userId: string,
    organizationId: string,
  ): Promise<InstallResult> {
    this.logger.log(
      `Installing prompt "${title}" for user ${userId}`,
      'MarketplaceInstallService',
    );

    const category =
      PROMPT_CATEGORY_MAP[downloadData.category as string] ||
      PromptCategory.PRESET_DESCRIPTION_IMAGE;

    const template = (downloadData.template as string) || title;

    const prompt = await this.promptsService.create({
      category,
      isFavorite: true,
      organization: organizationId,
      original: template,
    });

    return {
      resourceId: prompt._id.toString(),
      resourceType: 'prompt',
      title,
    };
  }

  private async installSkill(
    downloadData: Record<string, unknown>,
    title: string,
    listingId: string,
    userId: string,
    organizationId: string,
  ): Promise<InstallResult> {
    this.logger.log(
      `Installing skill "${title}" for user ${userId}`,
      'MarketplaceInstallService',
    );

    const slug =
      (downloadData.slug as string) || title.toLowerCase().replace(/\s+/g, '-');

    const skill = await this.skillsService.createSkill(userId, organizationId, {
      description: downloadData.description as string | undefined,
      files:
        (downloadData.files as Array<{ path: string; content: string }>) || [],
      slug,
      sourceListingId: listingId,
      title,
    });

    return {
      resourceId: skill._id.toString(),
      resourceType: 'skill',
      title,
    };
  }
}
