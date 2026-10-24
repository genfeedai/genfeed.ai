import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ModelProviderContract, Prisma } from '@genfeedai/prisma';

/**
 * The contract columns the pricing projection reads. `modelId` joins a row back
 * to its model; the heavy `openapi`, `inputSchema` and `outputSchema` columns
 * are never loaded.
 */
export const PRICING_CONTRACT_SELECT = {
  conditionalDimensions: true,
  discoveredAt: true,
  endpoint: true,
  lastSeenAt: true,
  mappingStatus: true,
  modelId: true,
  pricing: true,
  provider: true,
  reviewStatus: true,
  version: true,
} satisfies Prisma.ModelProviderContractSelect;

export type PricingContractRow = Pick<
  ModelProviderContract,
  keyof typeof PRICING_CONTRACT_SELECT
>;

export type ContractVersionRef = {
  id: string;
  pendingProviderContractVersion: string | null;
  reviewedProviderContractVersion: string | null;
};

/**
 * Contracts accumulate one row per provider version, but pricing only ever
 * reads the reviewed contract and the pending candidate (see
 * `projectModelBillablePricingProfile`). Loading a catalog's whole version
 * history on every quote is O(history) memory per call, so this loads just
 * those two versions per model, grouped by model id.
 */
export async function loadCurrentPricingContracts(
  prisma: PrismaService,
  models: readonly ContractVersionRef[],
): Promise<Map<string, PricingContractRow[]>> {
  const versionsByModel = new Map<string, Set<string>>();
  const versions = new Set<string>();
  for (const model of models) {
    const current = [
      model.reviewedProviderContractVersion,
      model.pendingProviderContractVersion,
    ].filter((version): version is string => Boolean(version));
    if (!current.length) continue;
    versionsByModel.set(model.id, new Set(current));
    for (const version of current) versions.add(version);
  }
  const contractsByModel = new Map<string, PricingContractRow[]>();
  if (!versionsByModel.size) return contractsByModel;

  // tenant-scope-ignore: provider contracts are platform data without an organizationId; the ids come from rows the caller already scoped
  const rows = await prisma.modelProviderContract.findMany({
    select: PRICING_CONTRACT_SELECT,
    where: {
      modelId: { in: [...versionsByModel.keys()] },
      version: { in: [...versions] },
    },
  });
  for (const row of rows) {
    // The `in` filters are a superset across models; keep the exact pairs.
    if (!versionsByModel.get(row.modelId)?.has(row.version)) continue;
    const contracts = contractsByModel.get(row.modelId) ?? [];
    contracts.push(row);
    contractsByModel.set(row.modelId, contracts);
  }
  return contractsByModel;
}
