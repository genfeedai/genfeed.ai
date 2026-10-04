import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import type { ModelsService } from '@api/collections/models/services/models.service';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import type { CrunQuotePreparation } from '@api/services/integrations/crun/crun-task.schema';
import type { CrunTaskService } from '@api/services/integrations/crun/crun-task.service';
import type { PromptBuilderService } from '@api/services/prompt-builder/prompt-builder.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { ModelCategory } from '@genfeedai/contracts';
import type {
  CrunModelInputContract,
  CrunQuoteReasonCode,
} from '@genfeedai/contracts/interfaces';
import { getRuntimeMarginMultiplier } from '@genfeedai/pricing';
import type { ConfigService } from '@libs/config/config.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Media-kind-neutral steps of preparing a Crun quote, shared by the image and
 * video input services. Character admission and reference resolution stay in
 * each input service so the admission coverage spec keeps seeing them.
 */

/** The intent fields the shared steps read; both quote intents satisfy it. */
export interface CrunQuoteIntentBase {
  brandId?: string;
  crunControls: { contractVersion: string };
  folderId?: string;
  harness?: unknown;
  knowledge?: {
    purposes?: readonly unknown[];
    sourceIds?: readonly unknown[];
    spaceIds?: readonly unknown[];
  };
  model: string;
  outputs: number;
  promptId?: string;
  requestedSkillSlugs: readonly unknown[];
  text: string;
}

export interface CrunPreparedInput<TIntent> {
  intent: TIntent;
  intentHash: string;
  brandId: string;
  preparation: CrunQuotePreparation;
  templateUsed?: string;
  templateVersion?: number;
}
export type CrunPreparedResult<TIntent> =
  | { isAvailable: true; data: CrunPreparedInput<TIntent> }
  | { isAvailable: false; reasonCode: CrunQuoteReasonCode };

type ReviewedModel = NonNullable<Awaited<ReturnType<ModelsService['findOne']>>>;
export type CrunReviewedContractResult =
  | {
      isAvailable: true;
      model: ReviewedModel;
      contract: CrunModelInputContract;
    }
  | { isAvailable: false; reasonCode: CrunQuoteReasonCode };

export function normalizeCrunQuoteIntent<TIntent extends CrunQuoteIntentBase>(
  schema: z.ZodType<TIntent>,
  raw: unknown,
  user: AuthenticatedUser,
): TIntent {
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    throw new BadRequestException({
      code: 'CRUN_INVALID_INPUT',
      fieldErrors: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  return { ...parsed.data, brandId: parsed.data.brandId ?? user.brandId };
}

export async function authorizeCrunSelection(
  prisma: PrismaService,
  intent: CrunQuoteIntentBase,
  user: AuthenticatedUser,
) {
  const brandId = intent.brandId;
  if (!brandId) throw new BadRequestException({ code: 'CRUN_INVALID_INPUT' });
  const brand = await prisma.brand.findFirst({
    where: {
      id: brandId,
      organizationId: user.organizationId,
      isDeleted: false,
    },
  });
  if (!brand) throw new ForbiddenException('Selected brand is unavailable');
  if (
    intent.folderId &&
    !(await prisma.folder.findFirst({
      where: {
        id: intent.folderId,
        organizationId: user.organizationId,
        brandId,
        isDeleted: false,
      },
      select: { id: true },
    }))
  )
    throw new ForbiddenException('Selected folder is unavailable');
  return { brandId, brand };
}

export async function validateCrunPromptProvenance(
  prisma: PrismaService,
  intent: CrunQuoteIntentBase,
  user: AuthenticatedUser,
  brandId: string,
): Promise<CrunQuoteReasonCode | null> {
  if (
    intent.harness ||
    intent.requestedSkillSlugs.length ||
    (intent.knowledge &&
      ((intent.knowledge.sourceIds?.length ?? 0) ||
        (intent.knowledge.spaceIds?.length ?? 0) ||
        (intent.knowledge.purposes?.length ?? 0)))
  )
    return 'CRUN_ENHANCEMENT_REQUIRED';
  if (intent.promptId) {
    const prompt = await prisma.prompt.findFirst({
      where: {
        id: intent.promptId,
        organizationId: user.organizationId,
        userId: user.userId,
        brandId,
        isDeleted: false,
      },
      select: { enhanced: true },
    });
    if (!prompt?.enhanced?.trim() || prompt.enhanced.trim() !== intent.text)
      return 'CRUN_ENHANCEMENT_REQUIRED';
  }
  return null;
}

export async function readReviewedCrunContract(
  models: ModelsService,
  intent: CrunQuoteIntentBase,
  user: AuthenticatedUser,
  kind: { category: ModelCategory; mediaKind: 'image' | 'video' },
): Promise<CrunReviewedContractResult> {
  const model = await models.findOne({
    key: intent.model,
    organizationId: user.organizationId,
  });
  if (
    model?.provider !== 'crun' ||
    !model.isActive ||
    model.isDeleted ||
    model.category !== kind.category
  )
    return { isAvailable: false, reasonCode: 'CRUN_MODEL_UNAVAILABLE' };
  if (
    model.pendingProviderContractVersion ||
    !model.reviewedProviderContractVersion ||
    intent.crunControls.contractVersion !==
      model.reviewedProviderContractVersion
  )
    return { isAvailable: false, reasonCode: 'CRUN_CONTRACT_UNAVAILABLE' };
  const rawContract = model.providerInputSchema;
  if (
    !rawContract ||
    typeof rawContract !== 'object' ||
    Array.isArray(rawContract)
  )
    return { isAvailable: false, reasonCode: 'CRUN_CONTRACT_UNAVAILABLE' };
  const contract = rawContract as unknown as CrunModelInputContract;
  if (
    contract.version !== model.reviewedProviderContractVersion ||
    contract.endpoint !== intent.model.slice(5) ||
    contract.mediaKind !== kind.mediaKind ||
    !contract.fields
  )
    return { isAvailable: false, reasonCode: 'CRUN_CONTRACT_UNAVAILABLE' };
  return { isAvailable: true, model, contract };
}

export async function prepareCrunPricing<TIntent extends CrunQuoteIntentBase>(
  deps: {
    config: ConfigService;
    models: ModelsService;
    prisma: PrismaService;
    tasks: CrunTaskService;
  },
  params: {
    brandId: string;
    built: Awaited<ReturnType<PromptBuilderService['buildPrompt']>>;
    contract: CrunModelInputContract;
    intent: TIntent;
    modelId: string;
    normalizedInput: CrunQuotePreparation['request']['input'];
    user: AuthenticatedUser;
  },
): Promise<CrunPreparedResult<TIntent>> {
  const { brandId, built, contract, intent, modelId, normalizedInput, user } =
    params;
  const unavailable = (
    reasonCode: CrunQuoteReasonCode,
  ): CrunPreparedResult<TIntent> => ({ isAvailable: false, reasonCode });
  const reviewed = await deps.prisma.modelProviderContract.findFirst({
    where: {
      modelId,
      provider: 'crun',
      endpoint: contract.endpoint,
      version: contract.version,
      reviewStatus: 'approved',
    },
    select: { pricing: true },
  });
  if (!reviewed) return unavailable('CRUN_CONTRACT_UNAVAILABLE');
  const profile = await deps.models.findBillablePricingProfile(
    intent.model,
    user.organizationId,
  );
  if (!profile) return unavailable('PRICING_UNAVAILABLE');
  let credential: CrunQuotePreparation['credential'];
  try {
    credential = await deps.tasks.resolveCredential(user.organizationId);
  } catch {
    return unavailable('CRUN_CREDENTIALS_UNAVAILABLE');
  }
  const creditsPerUsd = deps.config.get('CRUN_CREDITS_PER_USD');
  const rateVersion = deps.config.get('CRUN_RATE_VERSION');
  return {
    isAvailable: true,
    data: {
      intent,
      brandId,
      intentHash: quoteSnapshotHash(intent),
      templateUsed: built.templateUsed,
      templateVersion: built.templateVersion,
      preparation: {
        profile,
        contract,
        pricingEvidence: reviewed.pricing,
        request: { model: contract.endpoint, input: normalizedInput },
        credential,
        outputs: intent.outputs,
        creditsPerUsd: typeof creditsPerUsd === 'string' ? creditsPerUsd : null,
        acquisitionRateVersion:
          typeof rateVersion === 'string' ? rateVersion : null,
        marginMultiplier: getRuntimeMarginMultiplier(),
      },
    },
  };
}
