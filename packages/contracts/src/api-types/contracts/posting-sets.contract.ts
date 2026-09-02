/**
 * Posting set and signature contracts for the post scheduler.
 *
 * This is the request-side contract for reusable channel groups and platform
 * signatures. It intentionally expands to ordinary scheduler channel targets so
 * channel capability validation remains the next gate before scheduling.
 *
 * Foundation for parent issue #1132, child issue #1513.
 */

import { z } from 'zod';
import {
  CredentialPlatform,
  ReleaseAttachmentKind,
  TargetValidationState,
} from '../..';
import {
  dateStringSchema,
  nonEmptyStringSchema,
  nonNegativeIntSchema,
  timezoneSchema,
} from '../helpers/common-schemas';
import {
  type ChannelTargetInput,
  channelTargetSettingsSchema,
  releaseAttachmentInputSchema,
} from './scheduler.contract';

const idSchema = nonEmptyStringSchema({ max: 255 });
const labelSchema = nonEmptyStringSchema({ max: 120 });
const signatureBodySchema = nonEmptyStringSchema({ max: 4_000 });

export const postingSignaturePlacementValues = ['append', 'prepend'] as const;

export const postingSignaturePlacementSchema = z.enum(
  postingSignaturePlacementValues,
);

export const postingSignatureSchema = z.object({
  body: signatureBodySchema,
  id: idSchema,
  isEnabled: z.boolean().optional(),
  label: labelSchema,
  placement: postingSignaturePlacementSchema.optional(),
  platforms: z.array(z.nativeEnum(CredentialPlatform)).min(1),
});

export const postingSetTargetSchema = z.object({
  credentialId: idSchema,
  order: nonNegativeIntSchema.optional(),
  platform: z.nativeEnum(CredentialPlatform),
  settings: channelTargetSettingsSchema.optional(),
  signatureIds: z.array(idSchema).optional(),
  targetKey: idSchema,
  timezone: timezoneSchema.optional(),
});

export const postingSetSchema = z.object({
  brandId: idSchema.optional(),
  description: z.string().min(1).max(1_000).optional(),
  id: idSchema.optional(),
  isEnabled: z.boolean().optional(),
  label: labelSchema,
  targets: z.array(postingSetTargetSchema).min(1),
});

export const postingSetTargetOverrideSchema = z.object({
  attachments: z.array(releaseAttachmentInputSchema).optional(),
  credentialId: idSchema.optional(),
  excludedSignatureIds: z.array(idSchema).optional(),
  order: nonNegativeIntSchema.optional(),
  scheduledDate: dateStringSchema.optional(),
  settings: channelTargetSettingsSchema.optional(),
  signatureBodyOverrides: z.record(z.string(), signatureBodySchema).optional(),
  signatureIds: z.array(idSchema).optional(),
  targetKey: idSchema,
  timezone: timezoneSchema.optional(),
});

export const expandPostingSetTargetsInputSchema = z.object({
  overrides: z.array(postingSetTargetOverrideSchema).optional(),
  postingSet: postingSetSchema,
  scheduledDate: dateStringSchema.optional(),
  signatures: z.array(postingSignatureSchema).optional(),
  timezone: timezoneSchema.optional(),
});

export const renderPostingSignaturesInputSchema = z.object({
  content: z.string(),
  excludedSignatureIds: z.array(idSchema).optional(),
  platform: z.nativeEnum(CredentialPlatform),
  signatureBodyOverrides: z.record(z.string(), signatureBodySchema).optional(),
  signatureIds: z.array(idSchema),
  signatures: z.array(postingSignatureSchema),
});

export type PostingSignaturePlacement = z.infer<
  typeof postingSignaturePlacementSchema
>;
export type PostingSignatureInput = z.infer<typeof postingSignatureSchema>;
export type PostingSetTargetInput = z.infer<typeof postingSetTargetSchema>;
export type PostingSetInput = z.infer<typeof postingSetSchema>;
export type PostingSetTargetOverrideInput = z.infer<
  typeof postingSetTargetOverrideSchema
>;
export type ExpandPostingSetTargetsInput = z.infer<
  typeof expandPostingSetTargetsInputSchema
>;
export type RenderPostingSignaturesInput = z.infer<
  typeof renderPostingSignaturesInputSchema
>;

export const persistPostingSignatureInputSchema = postingSignatureSchema
  .omit({
    id: true,
  })
  .extend({
    brandId: idSchema.optional(),
  });

export const persistPostingSetInputSchema = postingSetSchema.omit({
  id: true,
});

export const updatePostingSignatureInputSchema =
  persistPostingSignatureInputSchema.partial();

export const updatePostingSetInputSchema = persistPostingSetInputSchema
  .partial()
  .extend({
    targets: z.array(postingSetTargetSchema).min(1).optional(),
  });

export const postingSetReferenceStateValues = [
  'valid',
  'unavailable',
  'deleted',
  'disconnected',
  'platform_mismatch',
  'disabled',
] as const;

export const postingSetReferenceStateSchema = z.enum(
  postingSetReferenceStateValues,
);

export const postingSetTargetValidationSchema = z.object({
  credentialId: idSchema,
  issues: z.array(z.string()),
  state: postingSetReferenceStateSchema,
  targetKey: idSchema,
});

export const postingSetSignatureValidationSchema = z.object({
  issues: z.array(z.string()),
  signatureId: idSchema,
  state: postingSetReferenceStateSchema,
});

export const postingSetLifecycleValidationSchema = z.object({
  signatures: z.array(postingSetSignatureValidationSchema),
  state: z.nativeEnum(TargetValidationState),
  targets: z.array(postingSetTargetValidationSchema),
});

export const postingSetCredentialRefSchema = z.object({
  id: idSchema,
  isConnected: z.boolean(),
  isDeleted: z.boolean(),
  platform: z.union([z.nativeEnum(CredentialPlatform), z.string().min(1)]),
});

export const validatePostingSetLifecycleInputSchema = z.object({
  credentials: z.array(postingSetCredentialRefSchema),
  postingSet: postingSetSchema,
  signatures: z.array(postingSignatureSchema).optional(),
});

export type PersistPostingSignatureInput = z.infer<
  typeof persistPostingSignatureInputSchema
>;
export type PersistPostingSetInput = z.infer<
  typeof persistPostingSetInputSchema
>;
export type UpdatePostingSignatureInput = z.infer<
  typeof updatePostingSignatureInputSchema
>;
export type UpdatePostingSetInput = z.infer<typeof updatePostingSetInputSchema>;
export type PostingSetReferenceState = z.infer<
  typeof postingSetReferenceStateSchema
>;
export type PostingSetTargetValidation = z.infer<
  typeof postingSetTargetValidationSchema
>;
export type PostingSetSignatureValidation = z.infer<
  typeof postingSetSignatureValidationSchema
>;
export type PostingSetLifecycleValidation = z.infer<
  typeof postingSetLifecycleValidationSchema
>;
export type PostingSetCredentialRef = z.infer<
  typeof postingSetCredentialRefSchema
>;
export type ValidatePostingSetLifecycleInput = z.infer<
  typeof validatePostingSetLifecycleInputSchema
>;

interface ResolvedPostingSignature {
  body: string;
  id: string;
  placement: PostingSignaturePlacement;
  platform: CredentialPlatform;
}

interface ExpandedTargetRecord {
  attachments?: ChannelTargetInput['attachments'];
  credentialId: string;
  order: number;
  platform: CredentialPlatform;
  scheduledDate?: string;
  settings?: Record<string, unknown>;
  timezone?: string;
}

function mergeTargetSettings(
  base: Record<string, unknown> | undefined,
  override: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const settings = {
    ...(base ?? {}),
    ...(override ?? {}),
  };

  return Object.keys(settings).length > 0 ? settings : undefined;
}

function stripUndefinedTargetFields(
  target: ExpandedTargetRecord,
): ChannelTargetInput {
  return Object.fromEntries(
    Object.entries(target).filter(([, value]) => value !== undefined),
  ) as ChannelTargetInput;
}

function resolvePostingSignatures(input: {
  excludedSignatureIds?: readonly string[];
  platform: CredentialPlatform;
  signatureBodyOverrides?: Readonly<Record<string, string>>;
  signatureIds?: readonly string[];
  signatures?: readonly PostingSignatureInput[];
}): ResolvedPostingSignature[] {
  const signatureIds = input.signatureIds ?? [];
  const excludedSignatureIds = new Set(input.excludedSignatureIds ?? []);
  const signatureById = new Map(
    (input.signatures ?? [])
      .filter((signature) => signature.isEnabled !== false)
      .map((signature) => [signature.id, signature]),
  );

  return signatureIds
    .filter((signatureId) => !excludedSignatureIds.has(signatureId))
    .map((signatureId) => signatureById.get(signatureId))
    .filter((signature): signature is PostingSignatureInput =>
      Boolean(signature?.platforms.includes(input.platform)),
    )
    .map((signature) => ({
      body: input.signatureBodyOverrides?.[signature.id] ?? signature.body,
      id: signature.id,
      placement: signature.placement ?? 'append',
      platform: input.platform,
    }));
}

function toSignatureAttachments(
  signatures: readonly ResolvedPostingSignature[],
) {
  return signatures.map((signature, order) => ({
    body: signature.body,
    kind: ReleaseAttachmentKind.SIGNATURE,
    order,
    platform: signature.platform,
  }));
}

function buildTargetAttachments(input: {
  override?: PostingSetTargetOverrideInput;
  signatures: readonly ResolvedPostingSignature[];
}): ChannelTargetInput['attachments'] | undefined {
  const attachments = [
    ...toSignatureAttachments(input.signatures),
    ...(input.override?.attachments ?? []),
  ];

  return attachments.length > 0 ? attachments : undefined;
}

function expandPostingSetTarget(input: {
  defaultScheduledDate?: string;
  defaultTimezone?: string;
  override?: PostingSetTargetOverrideInput;
  signatures?: readonly PostingSignatureInput[];
  target: PostingSetTargetInput;
  targetIndex: number;
}): ChannelTargetInput {
  const signatures = resolvePostingSignatures({
    excludedSignatureIds: input.override?.excludedSignatureIds,
    platform: input.target.platform,
    signatureBodyOverrides: input.override?.signatureBodyOverrides,
    signatureIds: input.override?.signatureIds ?? input.target.signatureIds,
    signatures: input.signatures,
  });

  return stripUndefinedTargetFields({
    attachments: buildTargetAttachments({
      override: input.override,
      signatures,
    }),
    credentialId: input.override?.credentialId ?? input.target.credentialId,
    order: input.override?.order ?? input.target.order ?? input.targetIndex,
    platform: input.target.platform,
    scheduledDate: input.override?.scheduledDate ?? input.defaultScheduledDate,
    settings: mergeTargetSettings(
      input.target.settings,
      input.override?.settings,
    ),
    timezone:
      input.override?.timezone ??
      input.target.timezone ??
      input.defaultTimezone,
  });
}

/**
 * Expand a reusable posting set into ordinary scheduler channel targets.
 *
 * This helper deliberately returns `ChannelTargetInput[]`, so later API,
 * composer, MCP, and CLI callers still pass the expanded targets through the
 * same channel capability validation as hand-authored targets.
 */
export function expandPostingSetTargets(
  input: ExpandPostingSetTargetsInput,
): ChannelTargetInput[] {
  const parsedInput = expandPostingSetTargetsInputSchema.parse(input);
  const overrideByTargetKey = new Map(
    (parsedInput.overrides ?? []).map((override) => [
      override.targetKey,
      override,
    ]),
  );

  return parsedInput.postingSet.targets.map((target, targetIndex) =>
    expandPostingSetTarget({
      defaultScheduledDate: parsedInput.scheduledDate,
      defaultTimezone: parsedInput.timezone,
      override: overrideByTargetKey.get(target.targetKey),
      signatures: parsedInput.signatures,
      target,
      targetIndex,
    }),
  );
}

/**
 * Render content with the signatures selected for a target platform.
 *
 * Consumers can use this for previews while still sending signatures as
 * explicit scheduler attachments. Disabled, excluded, missing, and
 * platform-ineligible signatures are ignored.
 */
export function renderContentWithPostingSignatures(
  input: RenderPostingSignaturesInput,
): string {
  const parsedInput = renderPostingSignaturesInputSchema.parse(input);
  const signatures = resolvePostingSignatures(parsedInput);
  if (signatures.length === 0) {
    return parsedInput.content;
  }

  const prepended = signatures
    .filter((signature) => signature.placement === 'prepend')
    .map((signature) => signature.body);
  const appended = signatures
    .filter((signature) => signature.placement === 'append')
    .map((signature) => signature.body);

  return [...prepended, parsedInput.content, ...appended]
    .filter((section) => section.trim().length > 0)
    .join('\n\n');
}

function credentialRefState(
  credential: PostingSetCredentialRef | undefined,
  platform: CredentialPlatform,
): { issues: string[]; state: PostingSetReferenceState } {
  if (!credential) {
    return {
      issues: ['Referenced credential is unavailable.'],
      state: 'unavailable',
    };
  }

  if (credential.isDeleted) {
    return {
      issues: ['Referenced credential was deleted.'],
      state: 'deleted',
    };
  }

  if (credential.platform !== platform) {
    return {
      issues: [
        `Credential platform "${credential.platform}" does not match target platform "${platform}".`,
      ],
      state: 'platform_mismatch',
    };
  }

  if (!credential.isConnected) {
    return {
      issues: ['Referenced credential is disconnected.'],
      state: 'disconnected',
    };
  }

  return { issues: [], state: 'valid' };
}

function signatureRefState(
  signature: PostingSignatureInput | undefined,
  platform: CredentialPlatform,
): { issues: string[]; state: PostingSetReferenceState } {
  if (!signature) {
    return {
      issues: ['Referenced signature is unavailable.'],
      state: 'unavailable',
    };
  }

  if (signature.isEnabled === false) {
    return {
      issues: ['Referenced signature is disabled.'],
      state: 'disabled',
    };
  }

  if (!signature.platforms.includes(platform)) {
    return {
      issues: [`Signature does not apply to platform "${platform}".`],
      state: 'platform_mismatch',
    };
  }

  return { issues: [], state: 'valid' };
}

function rollupLifecycleState(
  states: readonly PostingSetReferenceState[],
): TargetValidationState {
  if (
    states.some(
      (state) =>
        state === 'unavailable' ||
        state === 'deleted' ||
        state === 'platform_mismatch',
    )
  ) {
    return TargetValidationState.INVALID;
  }

  if (
    states.some((state) => state === 'disconnected' || state === 'disabled')
  ) {
    return TargetValidationState.WARNING;
  }

  return TargetValidationState.VALID;
}

/**
 * Validate persisted posting-set credential and signature references.
 *
 * Callers must pass sanitized credential refs only — never OAuth tokens or
 * other secret fields. Missing or deleted credentials degrade the set instead
 * of throwing, so later scheduler expansion can still run against remaining
 * targets.
 */
export function validatePostingSetLifecycle(
  input: ValidatePostingSetLifecycleInput,
): PostingSetLifecycleValidation {
  const parsedInput = validatePostingSetLifecycleInputSchema.parse(input);
  const credentialById = new Map(
    parsedInput.credentials.map((credential) => [credential.id, credential]),
  );
  const signatureById = new Map(
    (parsedInput.signatures ?? []).map((signature) => [
      signature.id,
      signature,
    ]),
  );

  const targets = parsedInput.postingSet.targets.map((target) => {
    const credentialState = credentialRefState(
      credentialById.get(target.credentialId),
      target.platform,
    );

    return {
      credentialId: target.credentialId,
      issues: credentialState.issues,
      state: credentialState.state,
      targetKey: target.targetKey,
    };
  });

  const signatures = parsedInput.postingSet.targets.flatMap((target) =>
    (target.signatureIds ?? []).map((signatureId) => {
      const signatureState = signatureRefState(
        signatureById.get(signatureId),
        target.platform,
      );

      return {
        issues: signatureState.issues,
        signatureId,
        state: signatureState.state,
      };
    }),
  );

  return {
    signatures,
    state: rollupLifecycleState([
      ...targets.map((target) => target.state),
      ...signatures.map((signature) => signature.state),
    ]),
    targets,
  };
}
