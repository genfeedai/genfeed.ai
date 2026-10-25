import { CLIPPER_REFERENCE_FRAME_MAX_CANDIDATES } from '@genfeedai/contracts/constants';
import { isRecord } from '@genfeedai/contracts/constants/type-guards.constant';
import {
  CLIPPER_REFERENCE_FRAME_CANDIDATE_STATUSES,
  CLIPPER_REFERENCE_FRAME_DIAGNOSTIC_SEVERITIES,
  CLIPPER_REFERENCE_FRAME_SCHEMA_VERSION,
  CLIPPER_REFERENCE_FRAME_STATUSES,
  type ClipperReferenceFrameCandidate,
  type ClipperReferenceFrameCandidateStatus,
  type ClipperReferenceFrameDiagnostic,
  type ClipperReferenceFrameDiagnosticSeverity,
  type ClipperReferenceFrameSet,
  type ClipperReferenceFrameStatus,
} from '@genfeedai/contracts/interfaces';

const candidateStatuses = new Set<string>(
  CLIPPER_REFERENCE_FRAME_CANDIDATE_STATUSES,
);
const diagnosticSeverities = new Set<string>(
  CLIPPER_REFERENCE_FRAME_DIAGNOSTIC_SEVERITIES,
);
const referenceFrameStatuses = new Set<string>(
  CLIPPER_REFERENCE_FRAME_STATUSES,
);
const unsafeStorageKeySegment = /(^|[\\/])\.\.([\\/]|$)/;

export function normalizeClipperReferenceTimestamps(
  timestamps: readonly number[],
): number[] {
  return [
    ...new Set(
      timestamps
        .filter((timestamp) => Number.isFinite(timestamp) && timestamp >= 0)
        .map((timestamp) => Math.round(timestamp * 1000) / 1000),
    ),
  ]
    .sort((left, right) => left - right)
    .slice(0, CLIPPER_REFERENCE_FRAME_MAX_CANDIDATES);
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => character.charCodeAt(0) <= 31);
}

export class ClipperReferenceFrameValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClipperReferenceFrameValidationError';
  }
}

function readRecordOrThrow(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ClipperReferenceFrameValidationError(
      `${field} must be an object`,
    );
  }

  return value as Record<string, unknown>;
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ClipperReferenceFrameValidationError(
      `${field} must be a non-empty string`,
    );
  }

  return value.trim();
}

function readOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  return readRequiredString(value, field);
}

function readPositiveInteger(
  value: unknown,
  field: string,
): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new ClipperReferenceFrameValidationError(
      `${field} must be a positive integer`,
    );
  }

  return value;
}

function normalizeUrl(value: unknown, field: string): string | undefined {
  const rawUrl = readOptionalString(value, field);
  if (!rawUrl) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ClipperReferenceFrameValidationError(
      `${field} must be an absolute HTTP(S) URL`,
    );
  }

  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username.length > 0 ||
    parsed.password.length > 0
  ) {
    throw new ClipperReferenceFrameValidationError(
      `${field} must be an absolute HTTP(S) URL without credentials`,
    );
  }

  return rawUrl;
}

function normalizeStorageKey(
  value: unknown,
  field: string,
): string | undefined {
  const storageKey = readOptionalString(value, field);
  if (!storageKey) {
    return undefined;
  }

  if (
    storageKey.startsWith('/') ||
    storageKey.startsWith('\\') ||
    unsafeStorageKeySegment.test(storageKey) ||
    hasControlCharacter(storageKey)
  ) {
    throw new ClipperReferenceFrameValidationError(
      `${field} must be a relative storage key without traversal segments`,
    );
  }

  return storageKey;
}

function normalizeDiagnostic(
  value: unknown,
  field: string,
): ClipperReferenceFrameDiagnostic {
  const diagnostic = readRecordOrThrow(value, field);
  const severity = readRequiredString(diagnostic.severity, `${field}.severity`);

  if (!diagnosticSeverities.has(severity)) {
    throw new ClipperReferenceFrameValidationError(
      `${field}.severity must be one of ${CLIPPER_REFERENCE_FRAME_DIAGNOSTIC_SEVERITIES.join(', ')}`,
    );
  }

  return {
    candidateId: readOptionalString(
      diagnostic.candidateId,
      `${field}.candidateId`,
    ),
    code: readRequiredString(diagnostic.code, `${field}.code`),
    message: readRequiredString(diagnostic.message, `${field}.message`),
    severity: severity as ClipperReferenceFrameDiagnosticSeverity,
  };
}

function normalizeDiagnostics(
  value: unknown,
  field: string,
): ClipperReferenceFrameDiagnostic[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new ClipperReferenceFrameValidationError(`${field} must be an array`);
  }

  return value.map((diagnostic, index) =>
    normalizeDiagnostic(diagnostic, `${field}[${index}]`),
  );
}

function normalizeCandidate(
  value: unknown,
  index: number,
): ClipperReferenceFrameCandidate {
  const field = `referenceFrames.candidates[${index}]`;
  const candidate = readRecordOrThrow(value, field);
  const id = readRequiredString(candidate.id, `${field}.id`);
  const status = readRequiredString(candidate.status, `${field}.status`);

  if (!candidateStatuses.has(status)) {
    throw new ClipperReferenceFrameValidationError(
      `${field}.status must be one of ${CLIPPER_REFERENCE_FRAME_CANDIDATE_STATUSES.join(', ')}`,
    );
  }

  if (
    typeof candidate.timestampSeconds !== 'number' ||
    !Number.isFinite(candidate.timestampSeconds) ||
    candidate.timestampSeconds < 0
  ) {
    throw new ClipperReferenceFrameValidationError(
      `${field}.timestampSeconds must be a finite non-negative number`,
    );
  }

  const assetId = readOptionalString(candidate.assetId, `${field}.assetId`);
  const storageKey = normalizeStorageKey(
    candidate.storageKey,
    `${field}.storageKey`,
  );
  const url = normalizeUrl(candidate.url, `${field}.url`);

  if (!assetId && !storageKey && !url) {
    throw new ClipperReferenceFrameValidationError(
      `${field} must include assetId, storageKey, or url`,
    );
  }

  const mimeType = readOptionalString(candidate.mimeType, `${field}.mimeType`);
  if (mimeType && !mimeType.startsWith('image/')) {
    throw new ClipperReferenceFrameValidationError(
      `${field}.mimeType must be an image media type`,
    );
  }

  return {
    assetId,
    diagnostics: normalizeDiagnostics(
      candidate.diagnostics,
      `${field}.diagnostics`,
    ),
    height: readPositiveInteger(candidate.height, `${field}.height`),
    id,
    mimeType,
    status: status as ClipperReferenceFrameCandidateStatus,
    storageKey,
    timestampSeconds: candidate.timestampSeconds,
    url,
    width: readPositiveInteger(candidate.width, `${field}.width`),
  };
}

function deriveStatus(
  requestedStatus: ClipperReferenceFrameStatus,
  candidates: ClipperReferenceFrameCandidate[],
  selectedCandidateId: string | null,
): ClipperReferenceFrameStatus {
  if (selectedCandidateId) {
    return 'selected';
  }

  if (candidates.length === 0) {
    if (requestedStatus === 'pending' || requestedStatus === 'unavailable') {
      return requestedStatus;
    }

    throw new ClipperReferenceFrameValidationError(
      'referenceFrames without candidates must be pending or unavailable',
    );
  }

  const availableCount = candidates.filter(
    (candidate) => candidate.status === 'available',
  ).length;
  const pendingCount = candidates.filter(
    (candidate) => candidate.status === 'pending',
  ).length;

  if (availableCount === candidates.length) {
    return 'ready';
  }

  if (availableCount > 0) {
    return 'partial';
  }

  return pendingCount > 0 ? 'pending' : 'unavailable';
}

export function normalizeClipperReferenceFrameSet(
  value: unknown,
): ClipperReferenceFrameSet {
  const referenceFrames = readRecordOrThrow(value, 'referenceFrames');

  if (
    referenceFrames.schemaVersion !== CLIPPER_REFERENCE_FRAME_SCHEMA_VERSION
  ) {
    throw new ClipperReferenceFrameValidationError(
      `referenceFrames.schemaVersion must be ${CLIPPER_REFERENCE_FRAME_SCHEMA_VERSION}`,
    );
  }

  const requestedStatus = readRequiredString(
    referenceFrames.status,
    'referenceFrames.status',
  );
  if (!referenceFrameStatuses.has(requestedStatus)) {
    throw new ClipperReferenceFrameValidationError(
      `referenceFrames.status must be one of ${CLIPPER_REFERENCE_FRAME_STATUSES.join(', ')}`,
    );
  }

  if (!Array.isArray(referenceFrames.candidates)) {
    throw new ClipperReferenceFrameValidationError(
      'referenceFrames.candidates must be an array',
    );
  }

  const candidates = referenceFrames.candidates.map(normalizeCandidate);
  const candidateIds = new Set<string>();
  for (const candidate of candidates) {
    if (candidateIds.has(candidate.id)) {
      throw new ClipperReferenceFrameValidationError(
        `referenceFrames contains duplicate candidate id ${candidate.id}`,
      );
    }
    candidateIds.add(candidate.id);
  }

  const selectedCandidateId =
    referenceFrames.selectedCandidateId === null ||
    referenceFrames.selectedCandidateId === undefined
      ? null
      : readRequiredString(
          referenceFrames.selectedCandidateId,
          'referenceFrames.selectedCandidateId',
        );

  if (selectedCandidateId) {
    const selectedCandidate = candidates.find(
      (candidate) => candidate.id === selectedCandidateId,
    );
    if (selectedCandidate?.status !== 'available') {
      throw new ClipperReferenceFrameValidationError(
        'referenceFrames.selectedCandidateId must resolve to an available candidate',
      );
    }
  }

  const status = deriveStatus(
    requestedStatus as ClipperReferenceFrameStatus,
    candidates,
    selectedCandidateId,
  );

  if (status !== requestedStatus) {
    throw new ClipperReferenceFrameValidationError(
      `referenceFrames.status must be ${status} for the supplied candidates and selection`,
    );
  }

  return {
    candidates,
    diagnostics: normalizeDiagnostics(
      referenceFrames.diagnostics,
      'referenceFrames.diagnostics',
    ),
    schemaVersion: CLIPPER_REFERENCE_FRAME_SCHEMA_VERSION,
    selectedCandidateId,
    status,
  };
}
