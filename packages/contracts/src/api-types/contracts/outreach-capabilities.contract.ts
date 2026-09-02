/**
 * Shared outreach platform/type capability matrix (#3404).
 *
 * A pair is executable only when provider primitives, recipient/target
 * resolution, production dispatch, scoped persistence, and the worker/executor
 * path have a reviewed end-to-end regression. Evaluation is deterministic and
 * never performs a provider network call.
 */

import { z } from 'zod';
import { CampaignPlatform, CampaignType } from '../..';

export const OUTREACH_CAPABILITY_REVIEWED_ON = '2026-08-24';

export const outreachCapabilityResultValues = [
  'executable',
  'unavailable',
] as const;

export const outreachCapabilityReasonValues = [
  'verified_x_public_reply',
  'verified_x_dm',
  'verified_x_scheduled_blast',
  'scheduled_blast_unavailable',
  'platform_unavailable',
  'unknown_pair',
] as const;

export const outreachCapabilityClientErrorCodeValues = [
  'outreach_capability.unavailable',
  'outreach_capability.target_platform_mismatch',
  'outreach_capability.active_configuration_locked',
] as const;

export const outreachCapabilityResultSchema = z.enum(
  outreachCapabilityResultValues,
);
export const outreachCapabilityReasonSchema = z.enum(
  outreachCapabilityReasonValues,
);
export const outreachCapabilityClientErrorCodeSchema = z.enum(
  outreachCapabilityClientErrorCodeValues,
);

const outreachCapabilityTextSchema = z.string().trim().min(1).max(2_000);

export const outreachCapabilityUiSchema = z
  .object({
    body: outreachCapabilityTextSchema,
    headline: outreachCapabilityTextSchema,
  })
  .strict();

export const outreachCapabilityEvaluationSchema = z
  .object({
    campaignType: z.string().trim().min(1).max(80),
    executable: z.boolean(),
    platform: z.string().trim().min(1).max(80),
    reason: outreachCapabilityReasonSchema,
    result: outreachCapabilityResultSchema,
    reviewedOn: z.iso.date(),
    ui: outreachCapabilityUiSchema,
  })
  .strict()
  .refine(
    (evaluation) =>
      evaluation.executable === (evaluation.result === 'executable'),
    'executable must match result.',
  );

export const outreachCapabilityClientErrorSchema = z
  .object({
    code: outreachCapabilityClientErrorCodeSchema,
    message: outreachCapabilityTextSchema,
    reason: outreachCapabilityReasonSchema.optional(),
  })
  .strict();

export type OutreachCapabilityResult = z.infer<
  typeof outreachCapabilityResultSchema
>;
export type OutreachCapabilityReason = z.infer<
  typeof outreachCapabilityReasonSchema
>;
export type OutreachCapabilityClientErrorCode = z.infer<
  typeof outreachCapabilityClientErrorCodeSchema
>;
export type OutreachCapabilityUi = z.infer<typeof outreachCapabilityUiSchema>;
export type OutreachCapabilityEvaluation = z.infer<
  typeof outreachCapabilityEvaluationSchema
>;
export type OutreachCapabilityClientError = z.infer<
  typeof outreachCapabilityClientErrorSchema
>;

export type OutreachCapabilityInput = {
  campaignType?: string | null;
  platform?: string | null;
};

const UNAVAILABLE_CLIENT_MESSAGE =
  'This outreach platform and campaign type combination is not available.';

const TARGET_PLATFORM_MISMATCH_MESSAGE =
  'Target platform must match the campaign platform.';

const ACTIVE_CONFIGURATION_LOCKED_MESSAGE =
  'Active campaigns cannot change platform or campaign type.';

const VERIFIED_PUBLIC_REPLY_UI = {
  body: 'X public replies can be created, started, and dispatched.',
  headline: 'X public reply is available',
} as const;

const VERIFIED_DM_UI = {
  body: 'X direct messages can be created, started, and dispatched.',
  headline: 'X DM is available',
} as const;

const VERIFIED_SCHEDULED_BLAST_UI = {
  body: 'X Scheduled Blast can be created, started, and dispatched at the saved due time.',
  headline: 'Scheduled Blast is available',
} as const;

const PLATFORM_UNAVAILABLE_UI = {
  body: 'Reddit and Instagram outreach are not available yet.',
  headline: 'This platform is not available',
} as const;

const UNKNOWN_PAIR_UI = {
  body: UNAVAILABLE_CLIENT_MESSAGE,
  headline: 'This combination is not available',
} as const;

function evaluation(draft: {
  campaignType: string;
  platform: string;
  reason: OutreachCapabilityReason;
  result: OutreachCapabilityResult;
  ui: OutreachCapabilityUi;
}): OutreachCapabilityEvaluation {
  return outreachCapabilityEvaluationSchema.parse({
    campaignType: draft.campaignType,
    executable: draft.result === 'executable',
    platform: draft.platform,
    reason: draft.reason,
    result: draft.result,
    reviewedOn: OUTREACH_CAPABILITY_REVIEWED_ON,
    ui: draft.ui,
  });
}

function verifiedPublicReply(
  platform: CampaignPlatform,
  campaignType: CampaignType,
): OutreachCapabilityEvaluation {
  return evaluation({
    campaignType,
    platform,
    reason: 'verified_x_public_reply',
    result: 'executable',
    ui: VERIFIED_PUBLIC_REPLY_UI,
  });
}

function verifiedDm(
  platform: CampaignPlatform,
  campaignType: CampaignType,
): OutreachCapabilityEvaluation {
  return evaluation({
    campaignType,
    platform,
    reason: 'verified_x_dm',
    result: 'executable',
    ui: VERIFIED_DM_UI,
  });
}

function verifiedScheduledBlast(
  platform: CampaignPlatform,
  campaignType: CampaignType,
): OutreachCapabilityEvaluation {
  return evaluation({
    campaignType,
    platform,
    reason: 'verified_x_scheduled_blast',
    result: 'executable',
    ui: VERIFIED_SCHEDULED_BLAST_UI,
  });
}

function platformUnavailable(
  platform: CampaignPlatform,
  campaignType: CampaignType,
): OutreachCapabilityEvaluation {
  return evaluation({
    campaignType,
    platform,
    reason: 'platform_unavailable',
    result: 'unavailable',
    ui: PLATFORM_UNAVAILABLE_UI,
  });
}

export const OUTREACH_CAPABILITY_MATRIX = {
  [CampaignPlatform.TWITTER]: {
    [CampaignType.MANUAL]: verifiedPublicReply(
      CampaignPlatform.TWITTER,
      CampaignType.MANUAL,
    ),
    [CampaignType.DISCOVERY]: verifiedPublicReply(
      CampaignPlatform.TWITTER,
      CampaignType.DISCOVERY,
    ),
    [CampaignType.DM_OUTREACH]: verifiedDm(
      CampaignPlatform.TWITTER,
      CampaignType.DM_OUTREACH,
    ),
    [CampaignType.SCHEDULED_BLAST]: verifiedScheduledBlast(
      CampaignPlatform.TWITTER,
      CampaignType.SCHEDULED_BLAST,
    ),
  },
  [CampaignPlatform.REDDIT]: {
    [CampaignType.MANUAL]: platformUnavailable(
      CampaignPlatform.REDDIT,
      CampaignType.MANUAL,
    ),
    [CampaignType.DISCOVERY]: platformUnavailable(
      CampaignPlatform.REDDIT,
      CampaignType.DISCOVERY,
    ),
    [CampaignType.DM_OUTREACH]: platformUnavailable(
      CampaignPlatform.REDDIT,
      CampaignType.DM_OUTREACH,
    ),
    [CampaignType.SCHEDULED_BLAST]: platformUnavailable(
      CampaignPlatform.REDDIT,
      CampaignType.SCHEDULED_BLAST,
    ),
  },
  [CampaignPlatform.INSTAGRAM]: {
    [CampaignType.MANUAL]: platformUnavailable(
      CampaignPlatform.INSTAGRAM,
      CampaignType.MANUAL,
    ),
    [CampaignType.DISCOVERY]: platformUnavailable(
      CampaignPlatform.INSTAGRAM,
      CampaignType.DISCOVERY,
    ),
    [CampaignType.DM_OUTREACH]: platformUnavailable(
      CampaignPlatform.INSTAGRAM,
      CampaignType.DM_OUTREACH,
    ),
    [CampaignType.SCHEDULED_BLAST]: platformUnavailable(
      CampaignPlatform.INSTAGRAM,
      CampaignType.SCHEDULED_BLAST,
    ),
  },
} as const satisfies Record<
  CampaignPlatform,
  Record<CampaignType, OutreachCapabilityEvaluation>
>;

const UNKNOWN_PAIR_EVALUATION = evaluation({
  campaignType: 'unknown',
  platform: 'unknown',
  reason: 'unknown_pair',
  result: 'unavailable',
  ui: UNKNOWN_PAIR_UI,
});

export const OUTREACH_CAPABILITY_UNAVAILABLE_ERROR =
  outreachCapabilityClientErrorSchema.parse({
    code: 'outreach_capability.unavailable',
    message: UNAVAILABLE_CLIENT_MESSAGE,
    reason: 'unknown_pair',
  });

export const OUTREACH_TARGET_PLATFORM_MISMATCH_ERROR =
  outreachCapabilityClientErrorSchema.parse({
    code: 'outreach_capability.target_platform_mismatch',
    message: TARGET_PLATFORM_MISMATCH_MESSAGE,
  });

export const OUTREACH_ACTIVE_CONFIGURATION_LOCKED_ERROR =
  outreachCapabilityClientErrorSchema.parse({
    code: 'outreach_capability.active_configuration_locked',
    message: ACTIVE_CONFIGURATION_LOCKED_MESSAGE,
  });

function normalizeCampaignPlatform(
  platform: string | null | undefined,
): CampaignPlatform | undefined {
  if (typeof platform !== 'string') {
    return undefined;
  }

  const normalized = platform.trim().toLowerCase();
  if (normalized === 'x' || normalized === 'twitter') {
    return CampaignPlatform.TWITTER;
  }

  return Object.values(CampaignPlatform).find((value) => value === normalized);
}

function normalizeCampaignType(
  campaignType: string | null | undefined,
): CampaignType | undefined {
  if (typeof campaignType !== 'string') {
    return undefined;
  }

  const normalized = campaignType.trim().toLowerCase();
  return Object.values(CampaignType).find((value) => value === normalized);
}

export function evaluateOutreachCapability(
  input: OutreachCapabilityInput,
): OutreachCapabilityEvaluation {
  const platform = normalizeCampaignPlatform(input.platform);
  const campaignType = normalizeCampaignType(input.campaignType);

  if (!platform || !campaignType) {
    return {
      ...UNKNOWN_PAIR_EVALUATION,
      campaignType:
        typeof input.campaignType === 'string' &&
        input.campaignType.trim().length > 0
          ? input.campaignType.trim()
          : 'unknown',
      platform:
        typeof input.platform === 'string' && input.platform.trim().length > 0
          ? input.platform.trim()
          : 'unknown',
    };
  }

  return OUTREACH_CAPABILITY_MATRIX[platform][campaignType];
}

export function isOutreachPairExecutable(
  input: OutreachCapabilityInput | OutreachCapabilityEvaluation,
): boolean {
  if ('executable' in input && 'result' in input) {
    return input.executable && input.result === 'executable';
  }

  return evaluateOutreachCapability(input).executable;
}

export function getOutreachCapabilityRefusal(
  input: OutreachCapabilityInput,
): OutreachCapabilityClientError | undefined {
  const evaluation = evaluateOutreachCapability(input);
  if (evaluation.executable) {
    return undefined;
  }

  return outreachCapabilityClientErrorSchema.parse({
    code: 'outreach_capability.unavailable',
    message: UNAVAILABLE_CLIENT_MESSAGE,
    reason: evaluation.reason,
  });
}

export function listOutreachCapabilityMatrix(): OutreachCapabilityEvaluation[] {
  return Object.values(CampaignPlatform).flatMap((platform) =>
    Object.values(CampaignType).map(
      (campaignType) => OUTREACH_CAPABILITY_MATRIX[platform][campaignType],
    ),
  );
}

export function listExecutableOutreachPairs(): Array<{
  campaignType: CampaignType;
  platform: CampaignPlatform;
}> {
  const pairs: Array<{
    campaignType: CampaignType;
    platform: CampaignPlatform;
  }> = [];

  for (const platform of Object.values(CampaignPlatform)) {
    for (const campaignType of Object.values(CampaignType)) {
      if (OUTREACH_CAPABILITY_MATRIX[platform][campaignType].executable) {
        pairs.push({ campaignType, platform });
      }
    }
  }

  return pairs;
}

export function listExecutableOutreachPlatforms(): CampaignPlatform[] {
  const platforms: CampaignPlatform[] = [];

  for (const pair of listExecutableOutreachPairs()) {
    if (!platforms.includes(pair.platform)) {
      platforms.push(pair.platform);
    }
  }

  return platforms;
}

export function listExecutableOutreachCampaignTypes(): CampaignType[] {
  const campaignTypes: CampaignType[] = [];

  for (const pair of listExecutableOutreachPairs()) {
    if (!campaignTypes.includes(pair.campaignType)) {
      campaignTypes.push(pair.campaignType);
    }
  }

  return campaignTypes;
}

export function doesOutreachTargetPlatformMatch(input: {
  campaignPlatform?: string | null;
  targetPlatform?: string | null;
}): boolean {
  const campaignPlatform = normalizeCampaignPlatform(input.campaignPlatform);
  const targetPlatform = normalizeCampaignPlatform(input.targetPlatform);

  return (
    Boolean(campaignPlatform) &&
    Boolean(targetPlatform) &&
    campaignPlatform === targetPlatform
  );
}
