import { randomUUID } from 'node:crypto';
import type { SystemWorkflowCatalogListItem } from '@api/collections/workflows/services/system-workflow-catalog.service';
import { SystemWorkflowCatalogService } from '@api/collections/workflows/services/system-workflow-catalog.service';
import { WorkflowsService } from '@api/collections/workflows/services/workflows.service';
import { computeNextRunAtOrThrow } from '@api/collections/workflows/utils/cron-schedule.util';
import { MarketplaceApiClient } from '@api/marketplace-integration/marketplace-api-client';
import { MarketplaceInstallService } from '@api/marketplace-integration/marketplace-install.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import {
  persistPendingToolConfirmation,
  verifyPendingToolConfirmation,
} from '@api/services/agent-orchestrator/tools/agent-tool-pending-confirmation.util';
import { resolveWorkflowBrand } from '@api/services/agent-orchestrator/tools/agent-workflow-tool.helpers';
import type {
  AgentBrandsServiceLike,
  AgentMembersServiceLike,
  OfficialWorkflowSource,
} from '@api/services/agent-orchestrator/tools/agent-workflow-tool.types';
import { AgentWorkflowToolCreateService } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-create.service';
import { AgentWorkflowToolOfficialResolverService } from '@api/services/agent-orchestrator/tools/agent-workflow-tool-official-resolver.service';
import { CacheService } from '@api/services/cache/cache.service';
import { WorkflowTrigger } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { type AgentToolResult } from '@genfeedai/contracts/interfaces';
import { toPrismaJson } from '@genfeedai/prisma';
import { formatRecurringSchedule } from '@helpers/formatting/recurring-schedule/recurring-schedule.helper';
import { ConfigService } from '@libs/config/config.service';
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Optional,
} from '@nestjs/common';

/**
 * Catalog + official-workflow install tools.
 */
@Injectable()
export class AgentWorkflowToolInstallService {
  constructor(
    private readonly configService: ConfigService,
    private readonly workflowsService: WorkflowsService,
    @Inject('AGENT_BRANDS_SERVICE')
    private readonly brandsService: AgentBrandsServiceLike,
    @Inject('AGENT_MEMBERS_SERVICE')
    private readonly membersService: AgentMembersServiceLike,
    private readonly systemWorkflowCatalogService: SystemWorkflowCatalogService,
    private readonly createService: AgentWorkflowToolCreateService,
    private readonly officialResolverService: AgentWorkflowToolOfficialResolverService,
    @Optional()
    private readonly marketplaceApiClient?: MarketplaceApiClient,
    @Optional()
    private readonly marketplaceInstallService?: MarketplaceInstallService,
    @Optional()
    @Inject(CacheService)
    private readonly cacheService?: CacheService,
  ) {}

  /**
   * Surfaces the code-owned system workflow catalog (#2223) to the agent so an
   * install can be discovered without leaving the conversation.
   */
  async listSystemWorkflowCatalog(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const family = readOptionalString(params.family);
    const includeNonInstallable = params.includeNonInstallable === true;
    const installedOnly = params.installedOnly === true;

    const catalog =
      await this.systemWorkflowCatalogService.listCatalogForOrganization(
        ctx.organizationId,
      );

    const entries = catalog
      .filter((entry) => includeNonInstallable || entry.installable)
      .filter((entry) => !family || entry.family === family)
      .filter((entry) => !installedOnly || entry.installed)
      .map((entry) => this.mapSystemCatalogEntryForTool(entry));

    return {
      creditsUsed: 0,
      data: {
        count: entries.length,
        entries,
      },
      success: true,
    };
  }

  /**
   * Installs one catalog entry as an editable org-owned copy. The underlying
   * service is idempotent, so a repeat install returns the existing workflow.
   */
  async installSystemWorkflow(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const canonicalId = readOptionalString(params.canonicalId);
    if (!canonicalId) {
      return {
        creditsUsed: 0,
        error: 'canonicalId is required',
        success: false,
      };
    }

    try {
      const brandId = await this.resolveInstallBrandId(params, ctx);

      const workflow = (await this.systemWorkflowCatalogService.install({
        brandId,
        canonicalId,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      })) as unknown as Record<string, unknown>;

      const workflowId = String(workflow.id ?? '');

      return {
        creditsUsed: 0,
        data: {
          canonicalId,
          editorUrl: `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${workflowId}`,
          id: workflowId,
          isScheduleEnabled: workflow.isScheduleEnabled,
          label: workflow.label ?? workflow.name,
          nextRunAt: workflow.nextRunAt,
          schedule: workflow.schedule,
        },
        success: true,
      };
    } catch (error) {
      return {
        creditsUsed: 0,
        error:
          error instanceof Error
            ? error.message
            : `Failed to install system workflow ${canonicalId}`,
        success: false,
      };
    }
  }

  async installOfficialWorkflow(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    // Confirmation is a server-owned fact: a model-supplied `confirmed`
    // parameter is stripped upstream in AgentToolConfirmationService, so the
    // only trustworthy signal that the operator actually clicked the install
    // card is `ctx.confirmationOrigin`, set exclusively by the card-button
    // resume path in AgentOrchestratorUiActionConfirmedToolService.
    const confirmed = ctx.confirmationOrigin === 'thread-ui-action';
    const schedule = readOptionalString(params.schedule);
    const timezone = readOptionalString(params.timezone) ?? 'UTC';

    if (confirmed) {
      const sourceActionId = readOptionalString(params.sourceActionId);
      if (!sourceActionId) {
        return {
          creditsUsed: 0,
          error: 'sourceActionId is required to confirm a workflow install.',
          success: false,
        };
      }
      if (!this.cacheService) {
        throw new InternalServerErrorException(
          'Workflow install confirmation persistence is unavailable.',
        );
      }
      const isVerifiedConfirmation = await verifyPendingToolConfirmation(
        this.cacheService,
        {
          organizationId: ctx.organizationId,
          sourceActionId,
          threadId: ctx.threadId ?? '',
          toolName: 'install_official_workflow',
        },
      );
      if (!isVerifiedConfirmation) {
        return {
          creditsUsed: 0,
          error:
            'sourceActionId does not match a persisted workflow install confirmation.',
          success: false,
        };
      }
    }

    const source = await this.officialResolverService.resolveInstallSource(
      params,
      ctx.organizationId,
    );

    if (!source) {
      return this.handleUnresolvedOfficialSource(
        params,
        ctx,
        confirmed,
        schedule,
        timezone,
      );
    }

    if (source.kind === 'system-catalog' && source.installedWorkflowId) {
      return this.buildAlreadyInstalledResult(source);
    }

    if (!confirmed) {
      return await this.buildOfficialInstallConfirmation(
        source,
        params,
        ctx,
        schedule,
        timezone,
      );
    }

    if (source.kind === 'system-catalog') {
      return this.installConfirmedSystemCatalog(
        source,
        params,
        ctx,
        schedule,
        timezone,
      );
    }

    if (source.kind === 'seeded-template') {
      return this.installConfirmedSeededTemplate(
        source,
        params,
        ctx,
        schedule,
        timezone,
      );
    }

    return this.installConfirmedMarketplaceListing(
      source,
      params,
      ctx,
      schedule,
      timezone,
    );
  }

  /**
   * A client-supplied brandId is untrusted: the catalog install builds its
   * create data straight from it, so a foreign brand would end up owning an
   * org's workflow. Only the server-derived `ctx.brandId` skips the lookup.
   */
  private async resolveInstallBrandId(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<string | undefined> {
    const requestedBrandId = readOptionalString(params.brandId);
    if (!requestedBrandId) {
      return ctx.brandId;
    }

    const brand = await this.brandsService.findOne({
      id: requestedBrandId,
      organizationId: ctx.organizationId,
    });

    if (!brand) {
      throw new BadRequestException(
        'Brand is not available in this organization',
      );
    }

    return requestedBrandId;
  }

  private async handleUnresolvedOfficialSource(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
    confirmed: boolean,
    schedule: string | undefined,
    timezone: string,
  ): Promise<AgentToolResult> {
    if (!confirmed) {
      if (!this.cacheService) {
        throw new InternalServerErrorException(
          'Workflow install confirmation persistence is unavailable.',
        );
      }
      const sourceActionId = `workflow-bootstrap-preview-generated-${randomUUID()}`;
      await persistPendingToolConfirmation(this.cacheService, {
        organizationId: ctx.organizationId,
        sourceActionId,
        threadId: ctx.threadId ?? '',
        toolName: 'install_official_workflow',
      });
      const confirmationPayload = {
        contentType:
          this.officialResolverService.inferBootstrapContentType(params),
        label:
          typeof params.label === 'string' && params.label.trim()
            ? params.label
            : undefined,
        prompt:
          typeof params.prompt === 'string' && params.prompt.trim()
            ? params.prompt
            : undefined,
        schedule,
        sourceActionId,
        timezone,
      };

      return {
        creditsUsed: 0,
        data: {
          confirmationRequired: true,
          resolution: 'generated',
        },
        nextActions: [
          {
            ctas: [
              {
                action: 'confirm_install_official_workflow',
                label: 'Confirm generate',
                payload: confirmationPayload,
              },
            ],
            description:
              'No strong official workflow match was found. Confirm and I will generate an org-owned workflow instead.',
            id: sourceActionId,
            scheduleSummary: schedule
              ? formatRecurringSchedule(schedule, timezone)
              : undefined,
            title: 'Generate a new workflow?',
            type: 'workflow_created_card' as const,
            workflowDescription:
              typeof params.prompt === 'string' ? params.prompt : undefined,
            workflowName:
              typeof params.label === 'string' && params.label.trim()
                ? params.label.trim()
                : 'Generated workflow',
          },
        ],
        requiresConfirmation: true,
        success: true,
      };
    }

    return this.createService.createWorkflowFromRecurringScaffold(
      {
        ...params,
        contentType:
          this.officialResolverService.inferBootstrapContentType(params),
        timezone,
      },
      ctx,
    );
  }

  private buildAlreadyInstalledResult(
    source: OfficialWorkflowSource,
  ): AgentToolResult {
    const installedWorkflowId = source.installedWorkflowId as string;

    return {
      creditsUsed: 0,
      data: {
        alreadyInstalled: true,
        canonicalId: source.id,
        editorUrl: `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${installedWorkflowId}`,
        id: installedWorkflowId,
      },
      nextActions: [
        {
          ctas: [
            {
              href: `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${installedWorkflowId}`,
              label: 'Open workflow',
            },
          ],
          description:
            'This Genfeed automation is already installed in your workspace.',
          id: `workflow-already-installed-${installedWorkflowId}`,
          title: 'Automation already installed',
          type: 'workflow_created_card' as const,
          workflowDescription: source.description,
          workflowId: installedWorkflowId,
          workflowName: source.name,
        },
      ],
      success: true,
    };
  }

  private async buildOfficialInstallConfirmation(
    source: OfficialWorkflowSource,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
    schedule: string | undefined,
    timezone: string,
  ): Promise<AgentToolResult> {
    if (!this.cacheService) {
      throw new InternalServerErrorException(
        'Workflow install confirmation persistence is unavailable.',
      );
    }
    const sourceActionId = `workflow-bootstrap-preview-${source.kind}-${randomUUID()}`;
    await persistPendingToolConfirmation(this.cacheService, {
      organizationId: ctx.organizationId,
      sourceActionId,
      threadId: ctx.threadId ?? '',
      toolName: 'install_official_workflow',
    });

    const marketplaceUrl = this.buildMarketplaceListingUrl(source.slug);
    const confirmationPayload = {
      brandId:
        typeof params.brandId === 'string' && params.brandId.trim()
          ? params.brandId
          : undefined,
      contentType:
        this.officialResolverService.inferBootstrapContentType(params),
      label:
        typeof params.label === 'string' && params.label.trim()
          ? params.label
          : undefined,
      prompt:
        typeof params.prompt === 'string' && params.prompt.trim()
          ? params.prompt
          : undefined,
      schedule,
      sourceActionId,
      sourceDescription: source.description,
      sourceId: source.id,
      sourceName: source.name,
      sourceSlug: source.slug,
      sourceType: source.kind,
      timezone,
    };

    return {
      creditsUsed: 0,
      data: {
        confirmationRequired: true,
        resolution: source.kind,
        sourceDescription: source.description,
        sourceId: source.id,
        sourceName: source.name,
        sourceSlug: source.slug,
        sourceType: source.kind,
      },
      nextActions: [
        {
          ctas: marketplaceUrl
            ? [
                {
                  action: 'confirm_install_official_workflow',
                  label: 'Confirm install',
                  payload: confirmationPayload,
                },
                { href: marketplaceUrl, label: 'Open source listing' },
              ]
            : [
                {
                  action: 'confirm_install_official_workflow',
                  label: 'Confirm install',
                  payload: confirmationPayload,
                },
              ],
          description:
            'Confirm to install this workflow into your organization, then apply your requested schedule and context.',
          id: sourceActionId,
          scheduleSummary: schedule
            ? formatRecurringSchedule(schedule, timezone)
            : undefined,
          title: 'Install official workflow?',
          type: 'workflow_created_card' as const,
          workflowDescription: source.description,
          workflowName: source.name,
        },
      ],
      requiresConfirmation: true,
      success: true,
    };
  }

  private async installConfirmedSystemCatalog(
    source: OfficialWorkflowSource,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
    schedule: string | undefined,
    timezone: string,
  ): Promise<AgentToolResult> {
    // Catalog canonicalIds are not WORKFLOW_TEMPLATES keys, so they must go
    // through the catalog install path rather than createWorkflow.
    const installResult = await this.installSystemWorkflow(
      { brandId: params.brandId, canonicalId: source.id },
      ctx,
    );

    if (!installResult.success) {
      return installResult;
    }

    const workflowId = String(installResult.data?.id ?? '');
    await this.applyInstalledWorkflowContext(workflowId, ctx, params, source);

    const nextRunAt = schedule
      ? computeNextRunAtOrThrow(schedule, timezone)
      : null;

    return {
      creditsUsed: 0,
      data: {
        ...installResult.data,
        installedFrom: source.kind,
        nextRunAt,
      },
      nextActions: [
        {
          ctas: [
            {
              href: `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${workflowId}`,
              label: 'Open workflow',
            },
            {
              href: APP_ROUTES.AUTOMATION.RUNS,
              label: 'Open executions',
            },
          ],
          description: 'Genfeed automation installed into your workspace.',
          id: `workflow-installed-${workflowId}`,
          nextRunAt: nextRunAt?.toISOString(),
          scheduleSummary: schedule
            ? formatRecurringSchedule(schedule, timezone)
            : undefined,
          title: 'Automation installed',
          type: 'workflow_created_card' as const,
          workflowDescription: source.description,
          workflowId,
          workflowName: source.name,
        },
      ],
      success: true,
    };
  }

  private async installConfirmedSeededTemplate(
    source: OfficialWorkflowSource,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
    schedule: string | undefined,
    timezone: string,
  ): Promise<AgentToolResult> {
    const workflow = await this.workflowsService.createWorkflow(
      ctx.userId,
      ctx.organizationId,
      {
        isScheduleEnabled: Boolean(schedule),
        label:
          typeof params.label === 'string' && params.label.trim()
            ? params.label.trim()
            : source.name,
        metadata: {
          createdFrom: 'agent',
          sourceTemplateId: source.id,
          sourceType: 'seeded-template',
        },
        schedule,
        templateId: source.id,
        timezone,
        trigger: WorkflowTrigger.MANUAL,
      },
    );

    const workflowId = String(workflow.id);
    await this.applyInstalledWorkflowContext(workflowId, ctx, params, source);

    return this.buildInstalledWorkflowResult({
      description: 'Official workflow installed into your workspace.',
      nextRunAt: schedule ? computeNextRunAtOrThrow(schedule, timezone) : null,
      schedule,
      source,
      timezone,
      workflowId,
    });
  }

  private async installConfirmedMarketplaceListing(
    source: OfficialWorkflowSource,
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
    schedule: string | undefined,
    timezone: string,
  ): Promise<AgentToolResult> {
    if (!this.marketplaceApiClient || !this.marketplaceInstallService) {
      return {
        creditsUsed: 0,
        error: 'Marketplace install services are unavailable.',
        success: false,
      };
    }

    const listing = await this.marketplaceApiClient.getListing(source.id);

    if (!listing) {
      return {
        creditsUsed: 0,
        error: 'Official marketplace workflow not found.',
        success: false,
      };
    }

    const ownership = await this.marketplaceApiClient.checkListingOwnership(
      source.id,
      ctx.userId,
      ctx.organizationId,
    );

    if (
      !ownership.owned &&
      ((listing.price ?? 0) > 0 || listing.pricingTier === 'premium')
    ) {
      return this.buildPurchaseRequiredResult(source, listing.slug);
    }

    const purchase =
      ownership.purchase ??
      (await this.marketplaceApiClient.claimFreeItem(
        source.id,
        ctx.userId,
        ctx.organizationId,
      ));

    const installResult =
      await this.marketplaceInstallService.installToWorkspace(
        source.id,
        ctx.userId,
        ctx.organizationId,
      );

    await this.applyInstalledWorkflowContext(
      installResult.resourceId,
      ctx,
      params,
      source,
    );

    return this.buildInstalledWorkflowResult({
      description: 'Official workflow installed into your workspace.',
      extraData: {
        purchaseId: purchase ? String(purchase._id) : undefined,
      },
      nextRunAt: schedule ? computeNextRunAtOrThrow(schedule, timezone) : null,
      schedule,
      source,
      timezone,
      workflowId: installResult.resourceId,
    });
  }

  private buildPurchaseRequiredResult(
    source: OfficialWorkflowSource,
    slug?: string,
  ): AgentToolResult {
    const marketplaceUrl = this.buildMarketplaceListingUrl(slug);

    return {
      creditsUsed: 0,
      data: {
        listingId: source.id,
        marketplaceUrl,
        requiresPurchase: true,
      },
      nextActions: [
        {
          ctas: marketplaceUrl
            ? [{ href: marketplaceUrl, label: 'Open marketplace listing' }]
            : [],
          description:
            'This official workflow is paid. Purchase it first, then I can install it into your workspace.',
          id: `workflow-purchase-required-${source.id}`,
          title: 'Purchase required',
          type: 'workflow_created_card' as const,
          workflowDescription: source.description,
          workflowName: source.name,
        },
      ],
      success: true,
    };
  }

  private buildInstalledWorkflowResult(input: {
    description: string;
    extraData?: Record<string, unknown>;
    nextRunAt: Date | null;
    schedule: string | undefined;
    source: OfficialWorkflowSource;
    timezone: string;
    workflowId: string;
  }): AgentToolResult {
    return {
      creditsUsed: 0,
      data: {
        editorUrl: `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${input.workflowId}`,
        id: input.workflowId,
        installedFrom: input.source.kind,
        nextRunAt: input.nextRunAt,
        ...input.extraData,
      },
      nextActions: [
        {
          ctas: [
            {
              href: `${APP_ROUTES.AUTOMATION.WORKFLOWS}/${input.workflowId}`,
              label: 'Open workflow',
            },
            {
              href: APP_ROUTES.AUTOMATION.RUNS,
              label: 'Open executions',
            },
          ],
          description: input.description,
          id: `workflow-installed-${input.workflowId}`,
          nextRunAt: input.nextRunAt?.toISOString(),
          scheduleSummary: input.schedule
            ? formatRecurringSchedule(input.schedule, input.timezone)
            : undefined,
          title: 'Automation installed',
          type: 'workflow_created_card' as const,
          workflowDescription: input.source.description,
          workflowId: input.workflowId,
          workflowName: input.source.name,
        },
      ],
      success: true,
    };
  }

  private async applyInstalledWorkflowContext(
    workflowId: string,
    ctx: ToolExecutionContext,
    params: Record<string, unknown>,
    source: OfficialWorkflowSource,
  ): Promise<void> {
    const workflow = await this.workflowsService.findOne({
      id: workflowId,
      organizationId: ctx.organizationId,
    });

    if (!workflow) {
      return;
    }

    const brand = await resolveWorkflowBrand(
      this.brandsService,
      this.membersService,
      params,
      ctx,
    );
    const schedule = readOptionalString(params.schedule);
    const timezone = readOptionalString(params.timezone) ?? 'UTC';

    await this.workflowsService.patch(workflowId, {
      brandId: brand?.id ? String(brand.id) : workflow.brandId,
      label:
        typeof params.label === 'string' && params.label.trim()
          ? params.label.trim()
          : workflow.label,
      metadata: toPrismaJson({
        ...(workflow.metadata ?? {}),
        createdFrom: 'agent',
        sourceId: source.id,
        sourceType: source.kind,
      }),
      ...(schedule
        ? {
            isScheduleEnabled: true,
            schedule,
            timezone,
          }
        : {}),
    });
  }

  private buildMarketplaceListingUrl(slug?: string): string | null {
    if (!slug) {
      return null;
    }

    const appUrl =
      this.configService.get('GENFEEDAI_APP_URL') || 'https://app.genfeed.ai';
    return `${appUrl.replace('app.', 'marketplace.')}/${slug}`;
  }

  private mapSystemCatalogEntryForTool(
    entry: SystemWorkflowCatalogListItem,
  ): Record<string, unknown> {
    return {
      canonicalId: entry.canonicalId,
      description: entry.description,
      family: entry.family,
      installable: entry.installable,
      installed: entry.installed,
      installedWorkflowId: entry.installedWorkflowId,
      isScheduleEnabled: entry.isScheduleEnabled,
      label: entry.label,
      schedule: entry.schedule,
      timezone: entry.timezone,
      version: entry.version,
    };
  }
}
