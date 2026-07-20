import {
  CLIP_REFERENCE_FRAME_CANDIDATE_STATUSES,
  CLIP_REFERENCE_FRAME_DIAGNOSTIC_SEVERITIES,
  CLIP_REFERENCE_FRAME_SCHEMA_VERSION,
  CLIP_REFERENCE_FRAME_STATUSES,
  type ClipReferenceFrameCandidate,
  type ClipReferenceFrameCandidateStatus,
  type ClipReferenceFrameDiagnostic,
  type ClipReferenceFrameDiagnosticSeverity,
  type ClipReferenceFrameSet,
  type ClipReferenceFrameStatus,
} from '@genfeedai/interfaces';

const candidateStatuses = new Set<string>(
  CLIP_REFERENCE_FRAME_CANDIDATE_STATUSES,
);
const diagnosticSeverities = new Set<string>(
  CLIP_REFERENCE_FRAME_DIAGNOSTIC_SEVERITIES,
);
const referenceFrameStatuses = new Set<string>(CLIP_REFERENCE_FRAME_STATUSES);
const unsafeStorageKeySegment = /(^|[\\/])\.\.([\\/]|$)/;

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => character.charCodeAt(0) <= 31);
}

export class ClipReferenceFrameValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClipReferenceFrameValidationError';
  }
}

function readRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ClipReferenceFrameValidationError(`${field} must be an object`);
  }

  return value as Record<string, unknown>;
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ClipReferenceFrameValidationError(
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
    throw new ClipReferenceFrameValidationError(
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
    throw new ClipReferenceFrameValidationError(
      `${field} must be an absolute HTTP(S) URL`,
    );
  }

  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username.length > 0 ||
    parsed.password.length > 0
  ) {
    throw new ClipReferenceFrameValidationError(
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
    throw new ClipReferenceFrameValidationError(
      `${field} must be a relative storage key without traversal segments`,
    );
  }

  return storageKey;
}

function normalizeDiagnostic(
  value: unknown,
  field: string,
): ClipReferenceFrameDiagnostic {
  const diagnostic = readRecord(value, field);
  const severity = readRequiredString(diagnostic.severity, `${field}.severity`);

  if (!diagnosticSeverities.has(severity)) {
    throw new ClipReferenceFrameValidationError(
      `${field}.severity must be one of ${CLIP_REFERENCE_FRAME_DIAGNOSTIC_SEVERITIES.join(', ')}`,
    );
  }

  return {
    candidateId: readOptionalString(
      diagnostic.candidateId,
      `${field}.candidateId`,
    ),
    code: readRequiredString(diagnostic.code, `${field}.code`),
    message: readRequiredString(diagnostic.message, `${field}.message`),
    severity: severity as ClipReferenceFrameDiagnosticSeverity,
  };
}

function normalizeDiagnostics(
  value: unknown,
  field: string,
): ClipReferenceFrameDiagnostic[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new ClipReferenceFrameValidationError(`${field} must be an array`);
  }

  return value.map((diagnostic, index) =>
    normalizeDiagnostic(diagnostic, `${field}[${index}]`),
  );
}

function normalizeCandidate(
  value: unknown,
  index: number,
): ClipReferenceFrameCandidate {
  const field = `referenceFrames.candidates[${index}]`;
  const candidate = readRecord(value, field);
  const id = readRequiredString(candidate.id, `${field}.id`);
  const status = readRequiredString(candidate.status, `${field}.status`);

  if (!candidateStatuses.has(status)) {
    throw new ClipReferenceFrameValidationError(
      `${field}.status must be one of ${CLIP_REFERENCE_FRAME_CANDIDATE_STATUSES.join(', ')}`,
    );
  }

  if (
    typeof candidate.timestampSeconds !== 'number' ||
    !Number.isFinite(candidate.timestampSeconds) ||
    candidate.timestampSeconds < 0
  ) {
    throw new ClipReferenceFrameValidationError(
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
    throw new ClipReferenceFrameValidationError(
      `${field} must include assetId, storageKey, or url`,
    );
  }

  const mimeType = readOptionalString(candidate.mimeType, `${field}.mimeType`);
  if (mimeType && !mimeType.startsWith('image/')) {
    throw new ClipReferenceFrameValidationError(
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
    status: status as ClipReferenceFrameCandidateStatus,
    storageKey,
    timestampSeconds: candidate.timestampSeconds,
    url,
    width: readPositiveInteger(candidate.width, `${field}.width`),
  };
}

function deriveStatus(
  requestedStatus: ClipReferenceFrameStatus,
  candidates: ClipReferenceFrameCandidate[],
  selectedCandidateId: string | null,
): ClipReferenceFrameStatus {
  if (selectedCandidateId) {
    return 'selected';
  }

  if (candidates.length === 0) {
    if (requestedStatus === 'pending' || requestedStatus === 'unavailable') {
      return requestedStatus;
    }

    throw new ClipReferenceFrameValidationError(
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

export function normalizeClipReferenceFrameSet(
  value: unknown,
): ClipReferenceFrameSet {
  const referenceFrames = readRecord(value, 'referenceFrames');

  if (referenceFrames.schemaVersion !== CLIP_REFERENCE_FRAME_SCHEMA_VERSION) {
    throw new ClipReferenceFrameValidationError(
      `referenceFrames.schemaVersion must be ${CLIP_REFERENCE_FRAME_SCHEMA_VERSION}`,
    );
  }

  const requestedStatus = readRequiredString(
    referenceFrames.status,
    'referenceFrames.status',
  );
  if (!referenceFrameStatuses.has(requestedStatus)) {
    throw new ClipReferenceFrameValidationError(
      `referenceFrames.status must be one of ${CLIP_REFERENCE_FRAME_STATUSES.join(', ')}`,
    );
  }

  if (!Array.isArray(referenceFrames.candidates)) {
    throw new ClipReferenceFrameValidationError(
      'referenceFrames.candidates must be an array',
    );
  }

  const candidates = referenceFrames.candidates.map(normalizeCandidate);
  const candidateIds = new Set<string>();
  for (const candidate of candidates) {
    if (candidateIds.has(candidate.id)) {
      throw new ClipReferenceFrameValidationError(
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
      throw new ClipReferenceFrameValidationError(
        'referenceFrames.selectedCandidateId must resolve to an available candidate',
      );
    }
  }

  const status = deriveStatus(
    requestedStatus as ClipReferenceFrameStatus,
    candidates,
    selectedCandidateId,
  );

  if (status !== requestedStatus) {
    throw new ClipReferenceFrameValidationError(
      `referenceFrames.status must be ${status} for the supplied candidates and selection`,
    );
  }

  return {
    candidates,
    diagnostics: normalizeDiagnostics(
      referenceFrames.diagnostics,
      'referenceFrames.diagnostics',
    ),
    schemaVersion: CLIP_REFERENCE_FRAME_SCHEMA_VERSION,
    selectedCandidateId,
    status,
  };
}
