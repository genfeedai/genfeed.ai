import type { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { WorkflowAdmissionAvailableSourceV1 } from '@api/collections/workflows/workflow-generation-admission.interface';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ApiKeyScope } from '@genfeedai/contracts';
import {
  type ExecutableNode,
  unwrapExecutableActionNode,
} from '@genfeedai/workflows/engine';

/** Brand ids named on action nodes, and the source ingredients whose brand stands in for one. */
export function collectWorkflowGenerationNodeBrandSources(
  nodes: readonly ExecutableNode[],
): { brandIds: string[]; parentIngredientIds: string[] } {
  const brandIds: string[] = [];
  const parentIngredientIds: string[] = [];
  for (const node of nodes) {
    if (node.type !== 'genfeedAction') continue;
    const { config } = unwrapExecutableActionNode(node);
    if (typeof config.brandId === 'string' && config.brandId)
      brandIds.push(config.brandId);
    if (
      typeof config.parentIngredientId === 'string' &&
      config.parentIngredientId
    )
      parentIngredientIds.push(config.parentIngredientId);
  }
  return { brandIds, parentIngredientIds };
}

/**
 * Whether a run of this workflow can resolve a brand at admission. A workflow
 * without one fails every run with "Workflow generation brand is unavailable".
 */
export function hasWorkflowGenerationBrandSource(
  workflowBrandId: string | null | undefined,
  nodes: readonly ExecutableNode[],
): boolean {
  if (workflowBrandId) return true;
  const { brandIds, parentIngredientIds } =
    collectWorkflowGenerationNodeBrandSources(nodes);
  return brandIds.length > 0 || parentIngredientIds.length > 0;
}

function isMediaGenerationNode(node: ExecutableNode): boolean {
  if (node.type !== 'genfeedAction') return false;
  const action = unwrapExecutableActionNode(node).type;
  return action === 'imageGen' || action === 'videoGen';
}

/**
 * Same check on a stored version graph (visual nodes), for saving a schedule.
 * Only image/video generation is guarded: a graph without those nodes is left
 * to run time. Null when the graph cannot be read here, so a caller never
 * blocks a save on a guess.
 */
export function hasStoredWorkflowGenerationBrandSource(
  workflowBrandId: string | null | undefined,
  graph: unknown,
): boolean | null {
  const storedNodes =
    graph !== null && typeof graph === 'object'
      ? (graph as { nodes?: unknown }).nodes
      : undefined;
  if (!Array.isArray(storedNodes)) return null;
  try {
    const nodes = storedNodes.map(
      (node: {
        id: string;
        type: string;
        data?: { config?: Record<string, unknown>; label?: string };
      }): ExecutableNode => ({
        config: node.data?.config ?? {},
        id: node.id,
        inputs: [],
        label: node.data?.label ?? node.id,
        type: node.type,
      }),
    );
    if (!nodes.some(isMediaGenerationNode)) return true;
    return hasWorkflowGenerationBrandSource(workflowBrandId, nodes);
  } catch {
    return null;
  }
}

/** Revalidate live membership, key status/scopes and brand grants using the canonical authority. */
export async function assertWorkflowGenerationActorAdmission(
  access: BrandAccessService,
  source: WorkflowAdmissionAvailableSourceV1,
  prisma: PrismaService,
  nodeId?: string,
): Promise<void> {
  const actor = {
    organizationId: source.organizationId,
    userId: source.actorUserId,
    ...(source.apiKeyId
      ? {
          isApiKey: true,
          apiKeyId: source.apiKeyId,
          scopes: source.actorScopes ?? [],
        }
      : {}),
  };
  const nodes = source.workflow.nodes.filter(
    (node) =>
      source.selectedNodeIds.includes(node.id) &&
      (nodeId === undefined || node.id === nodeId),
  );
  if (source.apiKeyId) {
    const key = await prisma.apiKey.findFirst({
      select: { scopes: true },
      where: {
        id: source.apiKeyId,
        organizationId: source.organizationId,
        userId: source.actorUserId,
        isRevoked: false,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    const scopes = (source.actorScopes ?? []).filter((scope) =>
      key?.scopes.includes(scope),
    );
    const required = new Set(
      nodes.flatMap((node) => {
        if (node.type !== 'genfeedAction') return [];
        const action = unwrapExecutableActionNode(node).type;
        return action === 'videoGen'
          ? [ApiKeyScope.VIDEOS_CREATE]
          : action === 'imageGen'
            ? [ApiKeyScope.IMAGES_CREATE]
            : [];
      }),
    );
    if (!key || [...required].some((scope) => !scopes.includes(scope)))
      throw new Error('Workflow generation key permission is unavailable');
  }
  const brands = new Set<string>(source.brandId ? [source.brandId] : []);
  const nodeSources = collectWorkflowGenerationNodeBrandSources(nodes);
  for (const brandId of nodeSources.brandIds) brands.add(brandId);
  for (const parentId of nodeSources.parentIngredientIds) {
    const parent = await prisma.ingredient.findFirst({
      select: { brandId: true },
      where: {
        id: parentId,
        organizationId: source.organizationId,
        isDeleted: false,
      },
    });
    if (!parent?.brandId)
      throw new Error('Workflow generation source brand is unavailable');
    brands.add(parent.brandId);
  }
  if (brands.size === 0) {
    // A brand is needed to fund and authorize image/video generation. A graph
    // without those nodes (for example the seeded Daily Trends Digest) names
    // no brand and has none to check.
    if (!nodes.some(isMediaGenerationNode)) return;
    throw new Error('Workflow generation brand is unavailable');
  }
  for (const brandId of brands) await access.assert(actor, brandId);
}
