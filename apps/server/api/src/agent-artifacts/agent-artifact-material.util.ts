import { createHash } from 'node:crypto';
import type {
  AgentArtifactRecordKind,
  AgentArtifactReference,
} from '@genfeedai/contracts/interfaces';

const CONTENT_DIGEST_PREFIX = 'sha256:v1:';
const IDEMPOTENCY_KEY_PREFIX = 'content-version-pin:v1:';
const POST_MATERIAL_FIELDS = [
  'brandId',
  'category',
  'credentialId',
  'description',
  'entityArticleId',
  'entityIngredientId',
  'entityModel',
  'groupId',
  'id',
  'isRepeat',
  'isShareToFeedSelected',
  'label',
  'maxRepeats',
  'nextScheduledDate',
  'order',
  'originalPostId',
  'parentId',
  'platform',
  'publishIntent',
  'quoteTweetId',
  'repeatDaysOfWeek',
  'repeatEndDate',
  'repeatFrequency',
  'repeatInterval',
  'scheduleSlot',
  'scheduledDate',
  'targetAttachments',
  'targetSettings',
  'timezone',
  'variantId',
] as const;
const POST_INGREDIENT_MATERIAL_FIELDS = [
  'category',
  'cdnUrl',
  'fileSize',
  'id',
  'mimeType',
  's3Key',
  'version',
] as const;

export type CanonicalArtifactRecord = Record<string, unknown>;

type ArtifactVersionPinIdentity = Readonly<
  Pick<
    AgentArtifactReference,
    'brandId' | 'kind' | 'organizationId' | 'recordId'
  >
>;

function isCanonicalArtifactRecord(
  value: unknown,
): value is CanonicalArtifactRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeForDigest(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForDigest(item));
  }
  if (isCanonicalArtifactRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalizeForDigest(item)]),
    );
  }
  return value;
}

export function readArtifactString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function readArtifactRecord(value: unknown): CanonicalArtifactRecord {
  return isCanonicalArtifactRecord(value) ? value : {};
}

export function pickArtifactRecord(
  record: Readonly<CanonicalArtifactRecord>,
  fields: readonly string[],
): CanonicalArtifactRecord {
  return Object.fromEntries(fields.map((field) => [field, record[field]]));
}

export function projectPostArtifactMaterial(
  record: Readonly<CanonicalArtifactRecord>,
): CanonicalArtifactRecord {
  const ingredients = Array.isArray(record.ingredients)
    ? record.ingredients
        .map((ingredient) =>
          pickArtifactRecord(
            readArtifactRecord(ingredient),
            POST_INGREDIENT_MATERIAL_FIELDS,
          ),
        )
        .sort((left, right) =>
          (readArtifactString(left.id) ?? '').localeCompare(
            readArtifactString(right.id) ?? '',
          ),
        )
    : [];

  return {
    ...pickArtifactRecord(record, POST_MATERIAL_FIELDS),
    ingredients,
  };
}

export function normalizeArtifactForSerializer(
  kind: AgentArtifactRecordKind,
  record: CanonicalArtifactRecord,
): CanonicalArtifactRecord {
  if (kind !== 'article') {
    return record;
  }

  // Persisted articles use coverImageUrl; only the serializer needs the
  // legacy bannerUrl projection.
  return {
    ...record,
    bannerUrl: record.coverImageUrl,
  };
}

export function buildArtifactContentDigest(
  material: Readonly<CanonicalArtifactRecord>,
): string {
  const canonicalJson = JSON.stringify(normalizeForDigest(material));
  return `${CONTENT_DIGEST_PREFIX}${createHash('sha256')
    .update(canonicalJson)
    .digest('hex')}`;
}

export function buildArtifactVersionPinIdempotencyKey(
  reference: ArtifactVersionPinIdentity,
  contentDigest: string,
): string {
  const identity = [
    reference.organizationId,
    reference.brandId ?? '~',
    reference.kind,
    reference.recordId,
    contentDigest,
  ].join('\u001f');
  return `${IDEMPOTENCY_KEY_PREFIX}${createHash('sha256')
    .update(identity)
    .digest('hex')}`;
}
