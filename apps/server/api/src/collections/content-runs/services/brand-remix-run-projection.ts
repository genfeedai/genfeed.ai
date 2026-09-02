import {
  remixIso,
  requireBrandRemixBrandId,
} from '@api/collections/content-runs/services/brand-remix-run-helpers';
import type {
  BrandRemixRunRecord,
  ResolvedBrandContext,
} from '@api/collections/content-runs/services/brand-remix-runs.types';
import { ContentRunStatus } from '@genfeedai/contracts';
import {
  BRAND_REMIX_RUN_CONTRACT,
  BRAND_REMIX_RUN_VERSION,
  type BrandRemixRunConfig,
  type BrandRemixRunView,
  brandRemixRunViewSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';

export function projectBrandRemixRun(
  run: BrandRemixRunRecord,
  brandContext: ResolvedBrandContext,
  config: BrandRemixRunConfig,
): BrandRemixRunView {
  return brandRemixRunViewSchema.parse({
    ...config,
    brand: {
      contextMode: brandContext.contextMode,
      id: brandContext.brand.id,
      name: brandContext.brand.label,
    },
    brandId: requireBrandRemixBrandId(run),
    contract: BRAND_REMIX_RUN_CONTRACT,
    createdAt: remixIso(run.createdAt),
    id: run.id,
    status: (run.status as ContentRunStatus | null) ?? ContentRunStatus.PENDING,
    updatedAt: remixIso(run.updatedAt),
    version: BRAND_REMIX_RUN_VERSION,
  });
}
