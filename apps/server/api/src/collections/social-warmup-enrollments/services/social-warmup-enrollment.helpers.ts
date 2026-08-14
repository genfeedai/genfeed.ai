import {
  SocialWarmupEventAction,
  SocialWarmupSignalSource,
  SocialWarmupSignalStatus,
} from '@genfeedai/enums';
import type {
  ISocialWarmupEnrollmentDocument,
  ISocialWarmupEventRecord,
  ISocialWarmupSignalRecord,
  SocialWarmupAccountAge,
  SocialWarmupReconnect,
} from '@genfeedai/interfaces';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NATIVE_ACCOUNT_AGE_KEY = 'native-account-age';
const FIRST_UPLOAD_KEY = 'first-upload-platform-signal';
const TIKTOK_AUTHORIZED_STORAGE_KEY = 'tiktokAuthorized';

const TIKTOK_REQUIRED_WARMUP_SCOPES = [
  'user.info.basic',
  'user.info.profile',
  'video.list',
] as const;

export const ENROLLMENT_UNIQUE_CONSTRAINT =
  'social_warmup_enrollments_org_credential_alive_key';

export const SIGNAL_UNIQUE_CONSTRAINT =
  'social_warmup_signals_enrollment_key_alive_key';

export function isEnrollmentUniqueViolation(error: unknown): boolean {
  return isNamedUniqueViolation(error, ENROLLMENT_UNIQUE_CONSTRAINT, [
    'organizationId',
    'credentialId',
  ]);
}

export function isSignalUniqueViolation(error: unknown): boolean {
  return isNamedUniqueViolation(error, SIGNAL_UNIQUE_CONSTRAINT, [
    'enrollmentId',
    'key',
  ]);
}

export function completedItemIdsFromEvents(
  events: readonly ISocialWarmupEventRecord[],
): string[] {
  const latestByItem = new Map<string, ISocialWarmupEventRecord>();
  for (const event of [...events].sort((left, right) => {
    return eventTime(left.occurredAt) - eventTime(right.occurredAt);
  })) {
    latestByItem.set(event.itemId, event);
  }

  return [...latestByItem.entries()]
    .filter(([, event]) => event.action === SocialWarmupEventAction.COMPLETED)
    .map(([itemId]) => itemId);
}

export function resolveSocialWarmupAccountAge(
  signals: readonly ISocialWarmupSignalRecord[],
  now: Date = new Date(),
): SocialWarmupAccountAge {
  const native = signals.find(
    (signal) => signal.key === NATIVE_ACCOUNT_AGE_KEY,
  );
  if (native) {
    return ageFromSignal(native, now, NATIVE_ACCOUNT_AGE_KEY);
  }

  const firstUpload = signals.find((signal) => signal.key === FIRST_UPLOAD_KEY);
  if (firstUpload) {
    return ageFromSignal(firstUpload, now, FIRST_UPLOAD_KEY);
  }

  return {
    accountAgeDays: null,
    accountAgeStatus: SocialWarmupSignalStatus.MISSING,
  };
}

export function hasPartialSocialWarmupScopes(warmupSignals: unknown): boolean {
  const stored = readRecord(warmupSignals);
  const snapshot = readRecord(stored[TIKTOK_AUTHORIZED_STORAGE_KEY]);
  if (snapshot.state === 'partial') {
    return true;
  }

  const grantedScopes = Array.isArray(snapshot.grantedScopes)
    ? snapshot.grantedScopes.filter((scope) => typeof scope === 'string')
    : [];
  if (
    grantedScopes.length > 0 &&
    TIKTOK_REQUIRED_WARMUP_SCOPES.some(
      (scope) => !grantedScopes.includes(scope),
    )
  ) {
    return true;
  }

  const evidence = Array.isArray(snapshot.evidence) ? snapshot.evidence : [];
  return evidence.some((item) => {
    const record = readRecord(item);
    return record.status === 'permission_limited';
  });
}

export function mapTikTokStatus(
  status: string | undefined,
): SocialWarmupSignalStatus {
  switch (status) {
    case 'available':
      return SocialWarmupSignalStatus.AVAILABLE;
    case 'empty':
      return SocialWarmupSignalStatus.EMPTY;
    case 'stale':
      return SocialWarmupSignalStatus.STALE;
    case 'unavailable':
      return SocialWarmupSignalStatus.UNAVAILABLE;
    case 'permission_limited':
      return SocialWarmupSignalStatus.PERMISSION_LIMITED;
    case 'failed':
      return SocialWarmupSignalStatus.FAILED;
    case 'revoked':
      return SocialWarmupSignalStatus.REVOKED;
    case 'missing':
      return SocialWarmupSignalStatus.MISSING;
    default:
      return SocialWarmupSignalStatus.UNAVAILABLE;
  }
}

export function mapTikTokSource(
  provenance: string | undefined,
): SocialWarmupSignalSource {
  if (provenance === 'genfeed_observed') {
    return SocialWarmupSignalSource.GENFEED;
  }
  if (provenance === 'user_confirmed') {
    return SocialWarmupSignalSource.USER;
  }
  return SocialWarmupSignalSource.PLATFORM;
}

export function safeSignalEvidence(value: unknown): Record<string, unknown> {
  const record = readRecord(value);
  const evidence: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (isSecretKey(key)) {
      continue;
    }
    evidence[key] = entry;
  }
  return evidence;
}

export function reconnectForCredential(params: {
  credentialId: string;
  hasPartialScopes: boolean;
  isConnected: boolean;
  platform?: string;
}): SocialWarmupReconnect | undefined {
  if (!params.isConnected) {
    return {
      credentialId: params.credentialId,
      isAvailable: true,
      platform: params.platform,
      reason: 'disconnected',
    };
  }

  if (params.hasPartialScopes) {
    return {
      credentialId: params.credentialId,
      isAvailable: true,
      platform: params.platform,
      reason: 'partial_scopes',
    };
  }

  return undefined;
}

export function withEnrollmentComputedFields(
  enrollment: Omit<
    ISocialWarmupEnrollmentDocument,
    | 'completedItemIds'
    | 'hasPartialScopes'
    | 'isCredentialConnected'
    | 'reconnect'
  > & {
    completedItemIds?: string[];
    hasPartialScopes?: boolean;
    isCredentialConnected?: boolean;
    reconnect?: SocialWarmupReconnect;
  },
): ISocialWarmupEnrollmentDocument {
  const events = enrollment.events ?? [];
  return {
    ...enrollment,
    completedItemIds:
      enrollment.completedItemIds ?? completedItemIdsFromEvents(events),
    hasPartialScopes: enrollment.hasPartialScopes ?? false,
    isCredentialConnected: enrollment.isCredentialConnected ?? true,
    reconnect: enrollment.reconnect,
  };
}

function ageFromSignal(
  signal: ISocialWarmupSignalRecord,
  now: Date,
  source: string,
): SocialWarmupAccountAge {
  if (signal.status === SocialWarmupSignalStatus.STALE) {
    return {
      accountAgeDays: daysFromEvidence(signal.evidence, now),
      accountAgeSource: source,
      accountAgeStatus: SocialWarmupSignalStatus.STALE,
    };
  }

  if (signal.status === SocialWarmupSignalStatus.FAILED) {
    return {
      accountAgeDays: null,
      accountAgeSource: source,
      accountAgeStatus: SocialWarmupSignalStatus.FAILED,
    };
  }

  if (
    signal.status === SocialWarmupSignalStatus.MISSING ||
    signal.status === SocialWarmupSignalStatus.UNAVAILABLE ||
    signal.status === SocialWarmupSignalStatus.REVOKED ||
    signal.status === SocialWarmupSignalStatus.PERMISSION_LIMITED ||
    signal.status === SocialWarmupSignalStatus.EMPTY
  ) {
    return {
      accountAgeDays: null,
      accountAgeSource: source,
      accountAgeStatus: signal.status,
    };
  }

  const days = daysFromEvidence(signal.evidence, now);
  if (days === null) {
    return {
      accountAgeDays: null,
      accountAgeSource: source,
      accountAgeStatus: SocialWarmupSignalStatus.MISSING,
    };
  }

  return {
    accountAgeDays: days,
    accountAgeSource: source,
    accountAgeStatus: SocialWarmupSignalStatus.AVAILABLE,
  };
}

function daysFromEvidence(evidence: unknown, now: Date): number | null {
  const record = readRecord(evidence);
  const nestedVideo = readRecord(record.video);
  const createTime =
    readUnixSeconds(record.createTime) ??
    readUnixSeconds(nestedVideo.createTime) ??
    readUnixSeconds(record.accountCreateTime);
  if (createTime !== undefined) {
    return Math.max(
      0,
      Math.floor((now.getTime() - createTime * 1000) / MS_PER_DAY),
    );
  }

  const iso =
    readString(record.createdAt) ??
    readString(record.observedAt) ??
    readString(record.accountCreatedAt);
  if (iso) {
    const date = new Date(iso);
    if (!Number.isNaN(date.getTime())) {
      return Math.max(
        0,
        Math.floor((now.getTime() - date.getTime()) / MS_PER_DAY),
      );
    }
  }

  if (typeof record.days === 'number' && Number.isFinite(record.days)) {
    return Math.max(0, Math.floor(record.days));
  }

  return null;
}

function eventTime(value: Date | string): number {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function isNamedUniqueViolation(
  error: unknown,
  constraint: string,
  fields: readonly string[],
): boolean {
  const candidate = error as {
    code?: unknown;
    meta?: { target?: unknown };
  };
  if (candidate?.code !== 'P2002') {
    return false;
  }

  const target = candidate.meta?.target;
  if (typeof target === 'string') {
    return (
      target === constraint || fields.every((field) => target.includes(field))
    );
  }

  return (
    Array.isArray(target) && fields.every((field) => target.includes(field))
  );
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readUnixSeconds(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function isSecretKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized.includes('token') ||
    normalized.includes('secret') ||
    normalized.includes('password') ||
    normalized.includes('authorization')
  );
}
