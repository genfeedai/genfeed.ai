import { BrandsService } from '@api/collections/brands/services/brands.service';
import { resolveEffectiveBrandAgentConfig } from '@api/collections/brands/utils/brand-agent-config-resolution.util';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AdsResearchService } from '@api/endpoints/ads-research/ads-research.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { InstagramInspirationService } from '@api/services/instagram-inspiration/instagram-inspiration.service';
import { CredentialPlatform } from '@genfeedai/enums';
import type {
  AgentToolResult,
  InstagramInspirationBrandContext,
  InstagramInspirationMediaType,
  InstagramInspirationSort,
  InstagramRemixMode,
} from '@genfeedai/interfaces';
import { AgentToolName } from '@genfeedai/interfaces';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';

function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

/**
 * Handles brand-scoped public Instagram inspiration and draft remix workflows.
 * Extracted from AgentToolExecutorService per #519/#520 so the executor stays
 * a routing boundary and the tenancy-sensitive brand resolver remains local to
 * this tool family.
 */
@Injectable()
export class AgentInstagramInspirationToolHandler {
  constructor(
    @Optional()
    public readonly adsResearchService: AdsResearchService | undefined,
    private readonly brandsService: BrandsService,
    @Optional()
    private readonly credentialsService: CredentialsService,
    private readonly instagramInspirationService: InstagramInspirationService,
  ) {}

  handles(toolName: AgentToolName): boolean {
    return (
      toolName === AgentToolName.LIST_INSTAGRAM_INSPIRATION ||
      toolName === AgentToolName.GET_INSTAGRAM_INSPIRATION_DETAIL ||
      toolName === AgentToolName.CREATE_INSTAGRAM_REMIX_WORKFLOW
    );
  }

  execute(
    toolName: AgentToolName,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    switch (toolName) {
      case AgentToolName.LIST_INSTAGRAM_INSPIRATION:
        return this.listInstagramInspiration(params, ctx);
      case AgentToolName.GET_INSTAGRAM_INSPIRATION_DETAIL:
        return this.getInstagramInspirationDetail(params, ctx);
      case AgentToolName.CREATE_INSTAGRAM_REMIX_WORKFLOW:
        return this.createInstagramRemixWorkflow(params, ctx);
      default:
        throw new Error(`Unsupported Instagram inspiration tool: ${toolName}`);
    }
  }

  async listInstagramInspiration(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const brand = await this.resolveBrandContext(params, ctx);
    const result =
      await this.instagramInspirationService.listInstagramInspiration({
        brand,
        hashtags: this.readStringArray(params.hashtags),
        limit: readOptionalNumber(params.limit),
        mediaType: this.readMediaType(params.mediaType),
        niche: readOptionalString(params.niche),
        sort: this.readSort(params.sort),
      });

    return {
      creditsUsed: 0,
      data: { ...result },
      success: true,
    };
  }

  async getInstagramInspirationDetail(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const brand = await this.resolveBrandContext(params, ctx);
    const username = readOptionalString(params.username);
    if (!username) {
      return {
        creditsUsed: 0,
        error: 'username is required to inspect Instagram inspiration.',
        success: false,
      };
    }

    const result =
      await this.instagramInspirationService.getInstagramInspirationDetail({
        brand,
        limit: readOptionalNumber(params.limit),
        mediaType: this.readMediaType(params.mediaType),
        sort: this.readSort(params.sort),
        username,
      });

    return {
      creditsUsed: 0,
      data: { ...result },
      success: true,
    };
  }

  async createInstagramRemixWorkflow(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const brand = await this.resolveBrandContext(params, ctx);
    const shortcode = readOptionalString(params.shortcode);
    const username = readOptionalString(params.username);
    if (!shortcode || !username) {
      return {
        creditsUsed: 0,
        error:
          'username and shortcode are required to create an Instagram remix workflow.',
        success: false,
      };
    }

    const result =
      await this.instagramInspirationService.createInstagramRemixWorkflow({
        brand,
        mode: this.readRemixMode(params.mode),
        notes: readOptionalString(params.notes),
        shortcode,
        userId: ctx.userId,
        username,
      });

    return {
      creditsUsed: 0,
      data: { ...result },
      nextActions: [
        {
          ctas: [
            {
              href: `/workflows/${result.workflowId}`,
              label: 'Review workflow',
            },
          ],
          description:
            'Draft workflow created from abstract Instagram creative signals. Review it before generation or publishing.',
          id: `instagram-remix-workflow-${result.workflowId}`,
          title: result.workflowName,
          type: 'workflow_created_card',
          workflowName: result.workflowName,
        },
      ],
      success: true,
    };
  }

  private async resolveBrandContext(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<InstagramInspirationBrandContext> {
    const explicitBrandId = readOptionalString(params.brandId);
    const brand = explicitBrandId
      ? await this.brandsService.findOne({
          _id: explicitBrandId,
          isDeleted: false,
          organization: ctx.organizationId,
        })
      : await this.brandsService.findOne({
          isDeleted: false,
          isSelected: true,
          organization: ctx.organizationId,
          user: ctx.userId,
        });

    if (!brand) {
      throw new BadRequestException(
        explicitBrandId
          ? 'The requested brand was not found in this organization.'
          : 'No brand is currently selected. Select a brand or pass brandId.',
      );
    }

    const brandRecord = brand as unknown as Record<string, unknown>;
    const brandId = String(brandRecord.id ?? brandRecord._id ?? '');
    if (!brandId) {
      throw new BadRequestException('The selected brand has no stable ID.');
    }

    const effectiveConfig = resolveEffectiveBrandAgentConfig({
      brand: brand as Parameters<
        typeof resolveEffectiveBrandAgentConfig
      >[0]['brand'],
      platform: 'instagram',
    });
    const credential = this.credentialsService
      ? await this.credentialsService.findOne({
          brandId,
          isConnected: true,
          isDeleted: false,
          organizationId: ctx.organizationId,
          platform: CredentialPlatform.INSTAGRAM,
        })
      : null;

    return {
      audience: this.readStringArray(effectiveConfig.voice?.audience),
      description: readOptionalString(brandRecord.description),
      hashtags: this.readStringArray(effectiveConfig.voice?.hashtags),
      id: brandId,
      label:
        readOptionalString(brandRecord.label) ??
        readOptionalString(brandRecord.name) ??
        'Brand',
      messagingPillars: this.readStringArray(
        effectiveConfig.voice?.messagingPillars,
      ),
      organizationId: ctx.organizationId,
      ownUsername: readOptionalString(
        (credential as unknown as Record<string, unknown> | null)
          ?.externalHandle,
      ),
      style: readOptionalString(effectiveConfig.voice?.style),
      tone: readOptionalString(effectiveConfig.voice?.tone),
      topics: this.readStringArray(effectiveConfig.strategy?.topics),
    };
  }

  private readMediaType(
    value: unknown,
  ): InstagramInspirationMediaType | undefined {
    return value === 'all' || value === 'posts' || value === 'reels'
      ? value
      : undefined;
  }

  private readSort(value: unknown): InstagramInspirationSort | undefined {
    return value === 'latest' || value === 'top' ? value : undefined;
  }

  private readRemixMode(value: unknown): InstagramRemixMode | undefined {
    return value === 'inspired_by' ||
      value === 'match_closely' ||
      value === 'remix_concept'
      ? value
      : undefined;
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }
}
