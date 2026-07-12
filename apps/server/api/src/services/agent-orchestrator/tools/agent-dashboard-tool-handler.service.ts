import { DashboardLayoutsService } from '@api/collections/dashboard-layouts/services/dashboard-layouts.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { sanitizeLayoutForPersistence } from '@genfeedai/agent/dashboard';
import type { AgentToolResult } from '@genfeedai/interfaces';
import { Injectable, Optional } from '@nestjs/common';

const DEFAULT_PAGE_KEY = 'workspace-overview';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveBrandId(
  params: Record<string, unknown>,
  ctx: ToolExecutionContext,
): string | undefined {
  return typeof params.brandId === 'string' && params.brandId
    ? params.brandId
    : ctx.brandId;
}

function resolvePageKey(params: Record<string, unknown>): string {
  return typeof params.pageKey === 'string' && params.pageKey
    ? params.pageKey
    : DEFAULT_PAGE_KEY;
}

/**
 * Handler for the dashboard-layout persistence tools (`save_dashboard_layout`,
 * `get_dashboard_layout`). Extracted out of the agent-tool-executor monolith per
 * #519/#520 — mirrors AgentMemoryGoalsToolHandler.
 */
@Injectable()
export class AgentDashboardToolHandler {
  constructor(
    @Optional()
    private readonly dashboardLayoutsService: DashboardLayoutsService,
  ) {}

  async saveDashboardLayout(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.dashboardLayoutsService) {
      return {
        creditsUsed: 0,
        error:
          'Dashboard layout persistence is not available in this environment.',
        success: false,
      };
    }

    const brandId = resolveBrandId(params, ctx);
    if (!brandId) {
      return {
        creditsUsed: 0,
        error:
          'No brand in context to save the dashboard layout for. Ask the user to select a brand first.',
        success: false,
      };
    }

    const pageKey = resolvePageKey(params);
    const document: Record<string, unknown> = isRecord(params.document)
      ? params.document
      : { blocks: Array.isArray(params.blocks) ? params.blocks : [] };

    // Validate up front so the model receives structured issues on rejection.
    // The service re-runs the same sanitization defensively before persisting.
    const { issues } = sanitizeLayoutForPersistence(document);
    if (issues.length > 0) {
      return {
        creditsUsed: 0,
        data: { issues },
        error:
          'Dashboard layout rejected: every data-bearing block (metric_card, kpi_grid card, chart, table, top_posts) must reference a known analytics sourceKey and carry no embedded data snapshot.',
        success: false,
      };
    }

    const layout = await this.dashboardLayoutsService.upsertForPage(
      ctx.organizationId,
      {
        brandId,
        document,
        pageKey,
        ...(typeof params.version === 'number'
          ? { version: params.version }
          : {}),
      },
    );

    return {
      creditsUsed: 0,
      data: { brandId, pageKey, saved: true, version: layout.version },
      success: true,
    };
  }

  async getDashboardLayout(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.dashboardLayoutsService) {
      return {
        creditsUsed: 0,
        error:
          'Dashboard layout persistence is not available in this environment.',
        success: false,
      };
    }

    const brandId = resolveBrandId(params, ctx);
    if (!brandId) {
      return {
        creditsUsed: 0,
        error: 'No brand in context to read the dashboard layout for.',
        success: false,
      };
    }

    const pageKey = resolvePageKey(params);
    const layout = await this.dashboardLayoutsService.findForPage(
      brandId,
      ctx.organizationId,
      pageKey,
    );

    return {
      creditsUsed: 0,
      data: {
        brandId,
        document: layout?.document ?? null,
        pageKey,
        version: layout?.version ?? null,
      },
      success: true,
    };
  }
}
