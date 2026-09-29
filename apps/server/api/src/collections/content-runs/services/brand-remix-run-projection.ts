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
import {
  type BrandRemixRunSummary,
  brandRemixRunSummarySchema,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run-summary.contract';

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

function summarizeRuntimeSeconds(config: BrandRemixRunConfig): number | null {
  const shots = config.concept?.storyboard ?? [];
  if (shots.length > 0) {
    return shots.reduce(
      (total, shot) => total + (shot.durationSeconds ?? 0),
      0,
    );
  }
  const { output } = config.draft;
  return 'durationSeconds' in output && output.durationSeconds
    ? output.durationSeconds
    : null;
}

/** Storyboard runs list row; never carries the draft, concept, or source payload. */
export function summarizeBrandRemixRun(
  run: BrandRemixRunRecord,
  config: BrandRemixRunConfig,
): BrandRemixRunSummary {
  return brandRemixRunSummarySchema.parse({
    brandId: requireBrandRemixBrandId(run),
    createdAt: remixIso(run.createdAt),
    id: run.id,
    outputKind: config.draft.output.kind,
    phase: config.phase,
    runtimeSeconds: summarizeRuntimeSeconds(config),
    scenePipelineState: config.scenePipeline?.state,
    shotCount: config.concept?.storyboard.length ?? 0,
    // Every source the pipeline accepts today is picked in Discovery; brief
    // (#5454) and uploaded-video (#5455) runs will set their own kind here.
    sourceKind: 'remix_discovery',
    title: config.sourceSnapshot.title,
    updatedAt: remixIso(run.updatedAt),
  });
}
