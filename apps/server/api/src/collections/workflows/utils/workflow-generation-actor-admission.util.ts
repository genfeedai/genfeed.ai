import type { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { WorkflowAdmissionAvailableSourceV1 } from '@api/collections/workflows/workflow-generation-admission.interface';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ApiKeyScope } from '@genfeedai/contracts';
import { unwrapExecutableActionNode } from '@genfeedai/workflows/engine';

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
  for (const node of nodes) {
    if (node.type !== 'genfeedAction') continue;
    const brandId = unwrapExecutableActionNode(node).config.brandId;
    if (typeof brandId === 'string' && brandId) brands.add(brandId);
    const parentId = unwrapExecutableActionNode(node).config.parentIngredientId;
    if (typeof parentId === 'string' && parentId) {
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
  }
  if (brands.size === 0)
    throw new Error('Workflow generation brand is unavailable');
  for (const brandId of brands) await access.assert(actor, brandId);
}
