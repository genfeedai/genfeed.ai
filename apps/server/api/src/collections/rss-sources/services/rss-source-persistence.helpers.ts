import {
  CredentialPlatform,
  parsePlatform,
  RssApprovalMode,
  RssImportPolicy,
} from '@genfeedai/contracts';
import type {
  PersistRssSourceInput,
  RssTargetChannel,
  UpdateRssSourceInput,
} from '@genfeedai/contracts/api-types/contracts/rss-sources.contract';
import {
  persistRssSourceInputSchema,
  rssTargetChannelSchema,
  updateRssSourceInputSchema,
} from '@genfeedai/contracts/api-types/contracts/rss-sources.contract';
import { BadRequestException } from '@nestjs/common';
import type { ZodError, ZodType } from 'zod';

export type StoredRssSourceRow = {
  approvalMode: string;
  brandId: string | null;
  createdAt: Date;
  failedCount: number;
  feedUrl: string;
  id: string;
  importedCount: number;
  importPolicy: string;
  isDeleted: boolean;
  isEnabled: boolean;
  label: string;
  lastError: string | null;
  lastPolledAt: Date | null;
  organizationId: string;
  skippedCount: number;
  targetChannels: unknown;
  timezone: string;
  updatedAt: Date;
  userId: string;
};

export function parseStoredRssApprovalMode(value: string): RssApprovalMode {
  return value === RssApprovalMode.AUTO
    ? RssApprovalMode.AUTO
    : RssApprovalMode.APPROVAL;
}

export function parseStoredRssImportPolicy(value: string): RssImportPolicy {
  switch (value) {
    case RssImportPolicy.SCHEDULED:
      return RssImportPolicy.SCHEDULED;
    case RssImportPolicy.PUBLISH_NOW:
      return RssImportPolicy.PUBLISH_NOW;
    default:
      return RssImportPolicy.DRAFT;
  }
}

export type StoredPostingSignatureRow = {
  body: string;
  id: string;
  isEnabled: boolean;
  platforms: string[];
};

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

export function parseCreateRssSourceInput(
  value: unknown,
): PersistRssSourceInput {
  return parseContractInput(
    persistRssSourceInputSchema,
    value,
    'Invalid RSS source payload',
  );
}

export function parseUpdateRssSourceInput(
  value: unknown,
): UpdateRssSourceInput {
  return parseContractInput(
    updateRssSourceInputSchema,
    value,
    'Invalid RSS source payload',
  );
}

export function parseStoredTargetChannels(value: unknown): RssTargetChannel[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const parsed = rssTargetChannelSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

export function toCredentialPlatform(
  value: string,
): CredentialPlatform | undefined {
  return parsePlatform(value);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown RSS poll error';
}
