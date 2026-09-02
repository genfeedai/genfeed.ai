import { DashboardLayoutsService } from '@api/collections/dashboard-layouts/services/dashboard-layouts.service';
import { runEffectPromise } from '@api/helpers/utils/effect/effect.util';
import { AgentStreamPublisherService } from '@api/services/agent-orchestrator/agent-stream-publisher.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { sanitizeLayoutForPersistence } from '@genfeedai/agent/server';
import type {
  AgentDashboardOperation,
  AgentToolResult,
  AgentUIBlock,
  ChartBlock,
  KPIGridBlock,
  TableBlock,
  TopPostsBlock,
} from '@genfeedai/contracts/interfaces';
import { Injectable, Optional } from '@nestjs/common';
import { Effect } from 'effect';

const DEFAULT_PAGE_KEY = 'workspace-overview';

interface DashboardHydrationState {
  status?: 'idle' | 'loading' | 'ready';
  staggerMs?: number;
}
type HydratableDashboardBlock<T extends AgentUIBlock = AgentUIBlock> = T & {
  hydration?: DashboardHydrationState;
};

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
 * Dashboard layout persistence + live render/hydration tools.
 * Extracted/extended from AgentToolExecutorService per #519/#520.
 */
@Injectable()
export class AgentDashboardToolHandler {
  constructor(
    @Optional()
    private readonly dashboardLayoutsService?: DashboardLayoutsService,
    @Optional()
    private readonly streamPublisher?: AgentStreamPublisherService,
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

  renderDashboard(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): AgentToolResult {
    const { operation, blocks, blockIds } = params as {
      operation: string;
      blocks?: unknown[];
      blockIds?: string[];
    };

    const normalizedOperation = this.normalizeDashboardOperation(operation);
    if (normalizedOperation === undefined) {
      return {
        creditsUsed: 0,
        error: `Unsupported dashboard operation: ${operation ?? 'missing'}`,
        success: false,
      };
    }
    const normalizedBlocks = Array.isArray(blocks)
      ? (blocks as AgentUIBlock[])
      : undefined;

    if (
      ctx.threadId &&
      normalizedBlocks &&
      normalizedBlocks.length > 0 &&
      normalizedOperation !== 'remove' &&
      normalizedOperation !== 'clear'
    ) {
      const loadingBlocks = this.buildLoadingDashboardBlocks(normalizedBlocks);

      void this.publishStagedDashboardHydration({
        blockIds,
        blocks: normalizedBlocks,
        ctx,
        initialBlocks: loadingBlocks,
        operation: normalizedOperation,
      });
    }

    return {
      creditsUsed: 0,
      data: {
        blockIds,
        blocks: normalizedBlocks,
        deferUiBlocksPublish: normalizedBlocks?.length ? true : undefined,
        operation: normalizedOperation,
        uiBlocks: normalizedBlocks,
      },
      success: true,
    };
  }

  private normalizeDashboardOperation(
    operation: string | undefined,
  ): AgentDashboardOperation | undefined {
    if (
      operation === 'replace' ||
      operation === 'add' ||
      operation === 'update' ||
      operation === 'remove' ||
      operation === 'clear'
    ) {
      return operation;
    }

    return undefined;
  }

  private buildLoadingDashboardBlocks(blocks: AgentUIBlock[]): AgentUIBlock[] {
    return blocks.map((block, index) =>
      this.toLoadingDashboardBlock(block, index),
    );
  }

  private toLoadingDashboardBlock(
    block: AgentUIBlock,
    index: number,
  ): AgentUIBlock {
    const hydration = {
      ...((block as HydratableDashboardBlock).hydration ?? {}),
      staggerMs: index * 90,
      status: 'loading' as const,
    };

    switch (block.type) {
      case 'metric_card':
        return {
          ...block,
          hydration,
          trend: undefined,
          value: '0',
        };
      case 'kpi_grid':
        return {
          ...block,
          cards: block.cards.map((card, cardIndex) => ({
            ...card,
            hydration: {
              ...((card as HydratableDashboardBlock<typeof card>).hydration ??
                {}),
              staggerMs: index * 90 + cardIndex * 60,
              status: 'loading' as const,
            },
            trend: undefined,
            value: '0',
          })),
          hydration,
        } satisfies KPIGridBlock;
      case 'chart':
        return {
          ...block,
          data: [],
          hydration,
        } satisfies ChartBlock;
      case 'table':
        return {
          ...block,
          hydration,
          rows: [],
        } satisfies TableBlock;
      case 'top_posts':
        return {
          ...block,
          hydration,
          posts: [],
        } satisfies TopPostsBlock;
      case 'composite':
        return {
          ...block,
          blocks: this.buildLoadingDashboardBlocks(block.blocks),
          hydration,
        };
      default:
        return {
          ...block,
          hydration,
        };
    }
  }

  private markDashboardBlockReady(block: AgentUIBlock): AgentUIBlock {
    switch (block.type) {
      case 'kpi_grid':
        return {
          ...block,
          cards: block.cards.map((card) => ({
            ...card,
            hydration: {
              ...((card as HydratableDashboardBlock<typeof card>).hydration ??
                {}),
              status: 'ready',
            },
          })),
          hydration: {
            ...((block as HydratableDashboardBlock).hydration ?? {}),
            status: 'ready',
          },
        } satisfies KPIGridBlock;
      case 'composite':
        return {
          ...block,
          blocks: block.blocks.map((child) =>
            this.markDashboardBlockReady(child),
          ),
          hydration: {
            ...((block as HydratableDashboardBlock).hydration ?? {}),
            status: 'ready',
          },
        };
      default:
        return {
          ...block,
          hydration: {
            ...((block as HydratableDashboardBlock).hydration ?? {}),
            status: 'ready',
          },
        };
    }
  }

  private publishTokenEffect(
    data: Parameters<AgentStreamPublisherService['publishToken']>[0],
  ): Effect.Effect<void, unknown> {
    if (!this.streamPublisher) {
      return Effect.void;
    }

    return this.streamPublisher.publishTokenEffect(data);
  }

  private publishToolProgressEffect(
    data: Parameters<AgentStreamPublisherService['publishToolProgress']>[0],
  ): Effect.Effect<void, unknown> {
    if (!this.streamPublisher) {
      return Effect.void;
    }

    return this.streamPublisher.publishToolProgressEffect(data);
  }

  private publishWorkEventEffect(
    data: Parameters<AgentStreamPublisherService['publishWorkEvent']>[0],
  ): Effect.Effect<void, unknown> {
    if (!this.streamPublisher) {
      return Effect.void;
    }

    return this.streamPublisher.publishWorkEventEffect(data);
  }

  private publishUIBlocksEffect(
    data: Parameters<AgentStreamPublisherService['publishUIBlocks']>[0],
  ): Effect.Effect<void, unknown> {
    if (!this.streamPublisher) {
      return Effect.void;
    }

    return this.streamPublisher.publishUIBlocksEffect(data);
  }

  private async publishStagedDashboardHydration(params: {
    blockIds?: string[];
    blocks: AgentUIBlock[];
    ctx: ToolExecutionContext;
    initialBlocks: AgentUIBlock[];
    operation: AgentDashboardOperation;
  }): Promise<void> {
    const { blockIds, blocks, ctx, initialBlocks, operation } = params;

    if (!ctx.threadId) {
      return;
    }

    try {
      await runEffectPromise(
        this.publishUIBlocksEffect({
          blockIds,
          blocks: initialBlocks,
          operation,
          runId: ctx.runId,
          threadId: ctx.threadId,
          userId: ctx.userId,
        }),
      );
    } catch {
      return;
    }

    await Promise.all(
      blocks.map(
        (block, index) =>
          new Promise<void>((resolve) => {
            setTimeout(
              async () => {
                try {
                  await runEffectPromise(
                    this.publishUIBlocksEffect({
                      blockIds: [block.id],
                      blocks: [this.markDashboardBlockReady(block)],
                      operation: 'update',
                      runId: ctx.runId,
                      threadId: ctx.threadId ?? ctx.runId ?? block.id,
                      userId: ctx.userId,
                    }),
                  );
                } catch {
                  // Redis failure is non-fatal.
                } finally {
                  resolve();
                }
              },
              180 + index * 140,
            );
          }),
      ),
    );
  }
}
