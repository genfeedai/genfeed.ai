import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  BrandRemixDraft,
  BrandRemixDraftEdits,
  BrandRemixRunConfig,
  BrandRemixSourceSnapshot,
} from '@api-types/contracts/brand-remix-run.contract';
import { IngredientStatus } from '@genfeedai/enums';
import type { IBrandKitResolvedAssets } from '@genfeedai/interfaces';
import type { Prisma } from '@genfeedai/prisma';

export const GENERATION_READY_STATUSES = new Set<string>([
  IngredientStatus.GENERATED,
  IngredientStatus.UPLOADED,
  IngredientStatus.VALIDATED,
]);
export const SUPPORTED_ASPECT_RATIOS = new Set(['1:1', '4:5', '9:16', '16:9']);
export const MAX_ERROR_LENGTH = 900;
export const MAX_SERIALIZATION_RETRIES = 3;
export const MAX_VARIANT_PATCH_RETRIES = 16;
export const PRISMA_SERIALIZATION_FAILURE = 'P2034';
export const REVIEW_CLAIM_LEASE_MS = 5 * 60 * 1000;
export const GENERATION_CLAIM_LEASE_MS = 5 * 60 * 1000;
export const PAID_DRAFT_CLAIM_LEASE_MS = 5 * 60 * 1000;

export const RUN_SELECT = {
  brandId: true,
  config: true,
  createdAt: true,
  id: true,
  isDeleted: true,
  organizationId: true,
  status: true,
  updatedAt: true,
} satisfies Prisma.ContentRunSelect;

export type BrandRemixRunRecord = Prisma.ContentRunGetPayload<{
  select: typeof RUN_SELECT;
}>;

export type BrandRemixReferenceEdit = NonNullable<
  BrandRemixDraftEdits['references']
>[number];

export type ContentRunPersistenceClient = Pick<PrismaService, 'contentRun'>;

export interface ResolvedBrandContext {
  brand: BrandDocument;
  brandKit: IBrandKitResolvedAssets;
  contextMode: 'brand' | 'organization_defaults';
  defaultIdentity: BrandRemixDraft['identity'];
}

export interface ResolvedSource {
  recommendedOutputKind: BrandRemixDraft['output']['kind'];
  snapshot: BrandRemixSourceSnapshot;
}

export interface GenerationDimensions {
  height: number;
  width: number;
}

export type RemixCreditsRequest = Request & {
  creditsConfig?: {
    amount?: number;
    deferred?: boolean;
    [key: string]: unknown;
  };
};

export interface ReconciledBrandRemixRun {
  config: BrandRemixRunConfig;
  run: BrandRemixRunRecord;
}
