import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import type {
  FeaturedWorkflowDocument,
  WorkflowEdge,
  WorkflowVisualNode,
} from '@api/collections/workflows/schemas/workflow.schema';
import { EXCLUDE_SYSTEM_WORKFLOW } from '@api/collections/workflows/utils/workflow-list-where.util';
import { hydrateWorkflowDefinition } from '@api/collections/workflows/workflow-version-definition';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  FEATURED_WORKFLOW_LIMIT,
  parseFeaturedWorkflowIds,
} from '@genfeedai/contracts/constants';
import type { IFeaturedWorkflowSummary } from '@genfeedai/contracts/interfaces';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

/**
 * Node config keys that bind a node to records of the organization that
 * authored the workflow. They are blanked on the way out, the way the code
 * templates ship them (`brandId: ''`), so a copy resolves its own brand and
 * credentials at run time instead of pointing at the source organization's.
 */
const SOURCE_ORG_NODE_CONFIG_KEYS = [
  'brandId',
  'credentialId',
  'organizationId',
  'userId',
] as const;

function toExposedNode(node: WorkflowVisualNode): WorkflowVisualNode {
  const config: Record<string, unknown> = { ...(node.data?.config ?? {}) };
  for (const key of SOURCE_ORG_NODE_CONFIG_KEYS) {
    if (key in config) {
      config[key] = '';
    }
  }

  return {
    data: {
      config,
      label: node.data?.label ?? '',
      ...(node.data?.inputVariableKeys
        ? { inputVariableKeys: node.data.inputVariableKeys }
        : {}),
    },
    id: node.id,
    position: { x: node.position?.x ?? 0, y: node.position?.y ?? 0 },
    type: node.type,
  };
}

function toExposedEdge(edge: WorkflowEdge): WorkflowEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
    ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
  };
}

function toSummary(
  workflow: FeaturedWorkflowDocument,
): IFeaturedWorkflowSummary {
  return {
    description: workflow.description,
    featuredRank: workflow.featuredRank,
    id: workflow.id,
    label: workflow.label,
    thumbnail: workflow.thumbnail,
  };
}

/**
 * Admin-pinned Featured workflows (#5511).
 *
 * A platform superadmin pins workflows from Admin → Automation → Workflows;
 * the ordered ids live on the `PlatformSetting` singleton. Every organization
 * reads the pinned workflows, in pin order, as the templates page Featured
 * row, and "Use" copies one into the caller's organization.
 *
 * Trust boundary: only pinned workflows are ever read across organizations,
 * and only through {@link FeaturedWorkflowDocument} — label, description,
 * thumbnail and the graph with source-organization bindings blanked. Config,
 * schedule, locks, run history, owner and brand never leave the source row.
 */
@Injectable()
export class FeaturedWorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformSettingsService: PlatformSettingsService,
  ) {}

  /**
   * The Featured row every organization sees: pinned workflows that still
   * exist, in pin order. Reads the pins through the platform-settings cache
   * and the workflows in one query. Empty when nothing is pinned.
   */
  async listFeatured(): Promise<FeaturedWorkflowDocument[]> {
    const { featuredWorkflowIds } =
      await this.platformSettingsService.getFeatureSettings();
    return this.resolveFeatured(featuredWorkflowIds);
  }

  /** One pinned workflow as organizations see it, or 404 when it is not pinned. */
  async findFeatured(workflowId: string): Promise<FeaturedWorkflowDocument> {
    const featured = (await this.listFeatured()).find(
      (workflow) => workflow.id === workflowId,
    );
    if (!featured) {
      throw new NotFoundException('Featured workflow', workflowId);
    }
    return featured;
  }

  /** The pins as an operator manages them, read from the row, not the cache. */
  async listPinned(): Promise<IFeaturedWorkflowSummary[]> {
    const settings = await this.platformSettingsService.getSingleton();
    const featured = await this.resolveFeatured(
      parseFeaturedWorkflowIds(settings.featuredWorkflowIds),
    );
    return featured.map(toSummary);
  }

  /**
   * Append a workflow to the end of the row. Idempotent for a pinned
   * workflow. Refuses a missing, deleted or system workflow (404) and a full
   * row (400). Pins whose workflow was deleted since are dropped.
   */
  async pin(workflowId: string): Promise<IFeaturedWorkflowSummary[]> {
    const pins = await this.platformSettingsService.updateFeaturedWorkflowIds(
      async (current) => {
        const eligible = await this.findEligibleIds([...current, workflowId]);
        if (!eligible.has(workflowId)) {
          throw new NotFoundException('Workflow', workflowId);
        }
        const kept = current.filter((id) => eligible.has(id));
        if (kept.includes(workflowId)) {
          return kept;
        }
        if (kept.length >= FEATURED_WORKFLOW_LIMIT) {
          throw new BadRequestException(
            `At most ${FEATURED_WORKFLOW_LIMIT} workflows can be featured. Unpin one first.`,
          );
        }
        return [...kept, workflowId];
      },
    );
    return (await this.resolveFeatured(pins)).map(toSummary);
  }

  /** Remove a workflow from the row. Idempotent for a workflow not pinned. */
  async unpin(workflowId: string): Promise<IFeaturedWorkflowSummary[]> {
    const pins = await this.platformSettingsService.updateFeaturedWorkflowIds(
      async (current) => {
        const eligible = await this.findEligibleIds(current);
        return current.filter((id) => id !== workflowId && eligible.has(id));
      },
    );
    return (await this.resolveFeatured(pins)).map(toSummary);
  }

  /**
   * Set the row order. `workflowIds` must list exactly the pinned workflows
   * that still exist; anything else means the caller's copy is stale (409).
   */
  async reorder(
    workflowIds: readonly string[],
  ): Promise<IFeaturedWorkflowSummary[]> {
    const pins = await this.platformSettingsService.updateFeaturedWorkflowIds(
      async (current) => {
        const eligible = await this.findEligibleIds(current);
        const live = current.filter((id) => eligible.has(id));
        const isSamePinSet =
          workflowIds.length === live.length &&
          new Set(workflowIds).size === workflowIds.length &&
          workflowIds.every((id) => live.includes(id));
        if (!isSamePinSet) {
          throw new ConflictException(
            'The new order must list exactly the pinned workflows. Reload and try again.',
          );
        }
        return workflowIds;
      },
    );
    return (await this.resolveFeatured(pins)).map(toSummary);
  }

  private async findEligibleIds(
    workflowIds: readonly string[],
  ): Promise<Set<string>> {
    const featured = await this.resolveFeatured(workflowIds);
    return new Set(featured.map((workflow) => workflow.id));
  }

  /**
   * The one cross-organization read: the given pinned ids, non-deleted and
   * not system workflows, projected to {@link FeaturedWorkflowDocument} in the
   * given order. Ranks count only workflows that still exist.
   */
  private async resolveFeatured(
    workflowIds: readonly string[],
  ): Promise<FeaturedWorkflowDocument[]> {
    if (workflowIds.length === 0) {
      return [];
    }

    const rows = await crossOrgUnsafe(
      async () =>
        // tenant-scope-ignore: admin-pinned Featured workflows (#5511) are platform-curated and read by every organization; only the sanitized projection below leaves this service
        await this.prisma.workflow.findMany({
          include: { currentVersion: true },
          where: {
            ...EXCLUDE_SYSTEM_WORKFLOW,
            id: { in: [...workflowIds] },
            isDeleted: false,
          },
        }),
    );
    const rowsById = new Map(rows.map((row) => [row.id, row]));

    const featured: FeaturedWorkflowDocument[] = [];
    for (const workflowId of workflowIds) {
      const row = rowsById.get(workflowId);
      if (!row) {
        continue;
      }
      const definition = hydrateWorkflowDefinition(row);
      featured.push({
        description: row.description ?? null,
        edgeStyle: definition.edgeStyle,
        edges: definition.edges.map(toExposedEdge),
        featuredRank: featured.length + 1,
        id: row.id,
        inputVariables: definition.inputVariables,
        label: row.label ?? null,
        nodes: definition.nodes.map(toExposedNode),
        thumbnail: row.thumbnail ?? null,
      });
    }
    return featured;
  }
}
