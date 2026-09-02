import type { Prisma } from '@genfeedai/prisma';

export const CAMPAIGN_TARGET_JSON_KEYS = [
  'authorId',
  'authorUsername',
  'contentCreatedAt',
  'contentText',
  'contentUrl',
  'discoverySource',
  'dmSentAt',
  'dmText',
  'likes',
  'matchedKeyword',
  'platform',
  'recipientUserId',
  'recipientUsername',
  'relevanceScore',
  'replies',
  'retweets',
  'targetType',
] as const;

export type CampaignTargetJsonKey = (typeof CAMPAIGN_TARGET_JSON_KEYS)[number];

export type CampaignTargetJsonFields = {
  authorId?: string | null;
  authorUsername?: string | null;
  contentCreatedAt?: Date | string | null;
  contentText?: string | null;
  contentUrl?: string | null;
  discoverySource?: string | null;
  dmSentAt?: Date | string | null;
  dmText?: string | null;
  likes?: number | null;
  matchedKeyword?: string | null;
  platform?: string | null;
  recipientUserId?: string | null;
  recipientUsername?: string | null;
  relevanceScore?: number | null;
  replies?: number | null;
  retweets?: number | null;
  targetType?: string | null;
};

export type CampaignTargetColumnPatch = {
  errorMessage?: string | null;
  externalId?: string | null;
  processedAt?: Date | null;
  replyExternalId?: string | null;
  replyText?: string | null;
  replyUrl?: string | null;
  retryCount?: number;
  scheduleVersion?: number;
  scheduledAt?: Date | null;
  skipReason?: string | null;
  status?: string;
};

export type CampaignTargetPatch = CampaignTargetColumnPatch &
  CampaignTargetJsonFields;

const CAMPAIGN_TARGET_JSON_KEY_SET = new Set<string>(CAMPAIGN_TARGET_JSON_KEYS);

const CAMPAIGN_TARGET_DATE_JSON_KEYS = new Set<CampaignTargetJsonKey>([
  'contentCreatedAt',
  'dmSentAt',
]);

const CAMPAIGN_TARGET_COLUMN_KEYS = new Set<string>([
  'errorMessage',
  'externalId',
  'processedAt',
  'replyExternalId',
  'replyText',
  'replyUrl',
  'retryCount',
  'scheduleVersion',
  'scheduledAt',
  'skipReason',
  'status',
]);

export function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (!raw) {
    return {};
  }

  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...(parsed as Record<string, unknown>) };
      }
      return {};
    } catch {
      return {};
    }
  }

  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }

  return {};
}

export function splitCampaignTargetPatch(update: CampaignTargetPatch): {
  columns: CampaignTargetColumnPatch;
  json: CampaignTargetJsonFields;
} {
  const columns: CampaignTargetColumnPatch = {};
  const json: CampaignTargetJsonFields = {};

  for (const [key, value] of Object.entries(update)) {
    if (value === undefined) {
      continue;
    }

    if (CAMPAIGN_TARGET_COLUMN_KEYS.has(key)) {
      (columns as Record<string, unknown>)[key] = value;
      continue;
    }

    if (CAMPAIGN_TARGET_JSON_KEY_SET.has(key)) {
      (json as Record<string, unknown>)[key] = value;
    }
  }

  return { columns, json };
}

export function toCampaignTargetDataPayload(
  source: Record<string, unknown>,
): Prisma.InputJsonValue {
  const payload: Record<string, Prisma.InputJsonValue> = {};

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (!CAMPAIGN_TARGET_JSON_KEY_SET.has(key)) {
      continue;
    }

    payload[key] =
      value instanceof Date
        ? value.toISOString()
        : (value as Prisma.InputJsonValue);
  }

  return payload;
}

export function mergeCampaignTargetJson(
  existing: unknown,
  patch: CampaignTargetJsonFields,
): Prisma.InputJsonValue {
  const current = parseJsonObject(existing);
  const next: Record<string, Prisma.InputJsonValue> = {};

  for (const [key, value] of Object.entries(current)) {
    if (value === undefined || value === null) {
      continue;
    }

    next[key] =
      value instanceof Date
        ? value.toISOString()
        : (value as Prisma.InputJsonValue);
  }

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }

    if (value === null) {
      delete next[key];
      continue;
    }

    next[key] =
      value instanceof Date
        ? value.toISOString()
        : (value as Prisma.InputJsonValue);
  }

  return next;
}

export function hydrateCampaignTargetJson<T extends { data?: unknown }>(
  row: T,
): T & CampaignTargetJsonFields {
  const payload = parseJsonObject(row.data);
  const hydrated: Record<string, unknown> = { ...row };

  for (const key of CAMPAIGN_TARGET_JSON_KEYS) {
    if (!(key in payload)) {
      continue;
    }

    hydrated[key] = hydrateJsonField(key, payload[key]);
  }

  return hydrated as T & CampaignTargetJsonFields;
}

function hydrateJsonField(key: CampaignTargetJsonKey, value: unknown): unknown {
  if (value === undefined || value === null) {
    return value;
  }

  if (CAMPAIGN_TARGET_DATE_JSON_KEYS.has(key) && typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed;
  }

  return value;
}
