/**
 * Posting set and signature contracts for the post scheduler.
 *
 * This is the request-side contract for reusable channel groups and platform
 * signatures. It intentionally expands to ordinary scheduler channel targets so
 * channel capability validation remains the next gate before scheduling.
 *
 * Foundation for parent issue #1132, child issue #1513.
 */

import {
  type ChannelTargetInput,
  channelTargetSettingsSchema,
  releaseAttachmentInputSchema,
} from '@api-types/contracts/scheduler.contract';
import {
  dateStringSchema,
  nonEmptyStringSchema,
  nonNegativeIntSchema,
  timezoneSchema,
} from '@api-types/helpers/common-schemas';
import { CredentialPlatform, ReleaseAttachmentKind } from '@genfeedai/enums';
import { z } from 'zod';

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
