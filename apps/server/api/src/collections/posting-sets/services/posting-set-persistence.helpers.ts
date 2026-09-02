import {
  CredentialPlatform,
  fromPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import type {
  PersistPostingSetInput,
  PersistPostingSignatureInput,
  PostingSetCredentialRef,
  PostingSetInput,
  PostingSetTargetInput,
  PostingSignatureInput,
  PostingSignaturePlacement,
  UpdatePostingSetInput,
  UpdatePostingSignatureInput,
} from '@genfeedai/contracts/api-types/contracts/posting-sets.contract';
import {
  persistPostingSetInputSchema,
  persistPostingSignatureInputSchema,
  postingSetTargetSchema,
  postingSignaturePlacementSchema,
  postingSignatureSchema,
  updatePostingSetInputSchema,
  updatePostingSignatureInputSchema,
} from '@genfeedai/contracts/api-types/contracts/posting-sets.contract';
import { BadRequestException } from '@nestjs/common';
import type { ZodError, ZodType } from 'zod';

export type StoredPostingSetRow = {
  brandId: string | null;
  createdAt: Date;
  description: string | null;
  id: string;
  isDeleted: boolean;
  isEnabled: boolean;
  label: string;
  organizationId: string;
  targets: unknown;
  updatedAt: Date;
  userId: string;
};

export type StoredPostingSignatureRow = {
  body: string;
  brandId: string | null;
  createdAt: Date;
  id: string;
  isDeleted: boolean;
  isEnabled: boolean;
  label: string;
  organizationId: string;
  placement: string;
  platforms: string[];
  updatedAt: Date;
  userId: string;
};

export type StoredCredentialRefRow = {
  id: string;
  isConnected: boolean;
  isDeleted: boolean;
  platform: string;
};

const CREDENTIAL_PLATFORM_VALUES = new Set<string>(
  Object.values(CredentialPlatform),
);

function badRequestFromZod(
  error: ZodError,
  title: string,
): BadRequestException {
  return new BadRequestException({
    detail: error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; '),
    title,
  });
}

export function parseContractInput<T>(
  schema: ZodType<T>,
  value: unknown,
  title: string,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw badRequestFromZod(parsed.error, title);
  }
  return parsed.data;
}

export function parseCreatePostingSetInput(
  value: unknown,
): PersistPostingSetInput {
  return parseContractInput(
    persistPostingSetInputSchema,
    value,
    'Invalid posting set payload',
  );
}

export function parseUpdatePostingSetInput(
  value: unknown,
): UpdatePostingSetInput {
  return parseContractInput(
    updatePostingSetInputSchema,
    value,
    'Invalid posting set payload',
  );
}

export function parseCreatePostingSignatureInput(
  value: unknown,
): PersistPostingSignatureInput {
  return parseContractInput(
    persistPostingSignatureInputSchema,
    value,
    'Invalid posting signature payload',
  );
}

export function parseUpdatePostingSignatureInput(
  value: unknown,
): UpdatePostingSignatureInput {
  return parseContractInput(
    updatePostingSignatureInputSchema,
    value,
    'Invalid posting signature payload',
  );
}

export function parseStoredPostingSetTargets(
  value: unknown,
): PostingSetTargetInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const parsed = postingSetTargetSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function parseStoredPlacement(
  value: unknown,
): PostingSignaturePlacement {
  const parsed = postingSignaturePlacementSchema.safeParse(value);
  return parsed.success ? parsed.data : 'append';
}

export function parseStoredPlatforms(value: unknown): CredentialPlatform[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (platform): platform is CredentialPlatform =>
      typeof platform === 'string' && CREDENTIAL_PLATFORM_VALUES.has(platform),
  );
}

export function toPostingSetInput(row: StoredPostingSetRow): PostingSetInput {
  return {
    brandId: row.brandId ?? undefined,
    description: row.description ?? undefined,
    id: row.id,
    isEnabled: row.isEnabled,
    label: row.label,
    targets: parseStoredPostingSetTargets(row.targets),
  };
}

export function toPostingSignatureInput(
  row: StoredPostingSignatureRow,
): PostingSignatureInput {
  const parsed = postingSignatureSchema.safeParse({
    body: row.body,
    id: row.id,
    isEnabled: row.isEnabled,
    label: row.label,
    placement: parseStoredPlacement(row.placement),
    platforms: parseStoredPlatforms(row.platforms),
  });

  if (parsed.success) {
    return parsed.data;
  }

  return {
    body: row.body,
    id: row.id,
    isEnabled: row.isEnabled,
    label: row.label,
    placement: parseStoredPlacement(row.placement),
    platforms: parseStoredPlatforms(row.platforms),
  };
}

export function toCredentialRefs(
  rows: readonly StoredCredentialRefRow[],
): PostingSetCredentialRef[] {
  return rows.map((row) => ({
    id: row.id,
    isConnected: row.isConnected,
    isDeleted: row.isDeleted,
    platform: fromPrismaCredentialPlatform(row.platform) ?? row.platform,
  }));
}

export function referencedCredentialIds(
  targets: readonly PostingSetTargetInput[],
): string[] {
  return [...new Set(targets.map((target) => target.credentialId))];
}

export function referencedSignatureIds(
  targets: readonly PostingSetTargetInput[],
): string[] {
  return [...new Set(targets.flatMap((target) => target.signatureIds ?? []))];
}
