import { createHash } from 'node:crypto';
import type { MediaPerceptionFingerprint } from '@genfeedai/contracts/api-types/contracts/media-perception.contract';
import type { MediaProbe } from '@genfeedai/contracts/api-types/contracts/media-readiness.contract';
import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';

/** Populated only by tenant-scoped stored-asset lookup and measured file bytes. */
export interface SeedanceVideoReferenceEvidence {
  assetId: string;
  organizationId: string;
  sourceKey: string;
  sourceVersion: string;
  duration: number;
  width: number;
  height: number;
  framesPerSecond: number;
  sizeBytes: number;
  url: string;
}

export interface SeedanceReferenceQuoteEvidence {
  inputDuration: number;
  referenceEvidenceHash: string;
}

export function requireSeedanceStoredReferenceKey(
  key: string | null | undefined,
  expected?: string,
): string {
  if (!key || (expected !== undefined && key !== expected))
    throw new BadRequestException({
      code: 'SEEDANCE_REFERENCE_EVIDENCE_CHANGED',
    });
  return key;
}

interface MeasuredSeedanceVideoReference {
  assetId: string;
  organizationId: string;
  sourceKey: string;
  url: string;
  before: MediaPerceptionFingerprint;
  after: MediaPerceptionFingerprint;
  probe: MediaProbe;
}

export function measuredSeedanceVideoReference(
  measured: MeasuredSeedanceVideoReference,
): SeedanceVideoReferenceEvidence {
  const { before, after, probe } = measured;
  if (
    before.assetHash !== after.assetHash ||
    before.sizeBytes !== after.sizeBytes ||
    probe.sizeBytes !== after.sizeBytes ||
    probe.durationSeconds === null ||
    probe.width === null ||
    probe.height === null ||
    probe.frameRate === null
  )
    throw new BadRequestException({
      code: 'SEEDANCE_REFERENCE_EVIDENCE_CHANGED',
    });
  return {
    assetId: measured.assetId,
    organizationId: measured.organizationId,
    sourceKey: measured.sourceKey,
    url: measured.url,
    sourceVersion: after.assetHash,
    sizeBytes: after.sizeBytes,
    duration: probe.durationSeconds,
    width: probe.width,
    height: probe.height,
    framesPerSecond: probe.frameRate,
  };
}

export function seedanceVideoReferenceLimit(endpoint: string): number | null {
  if (
    /^bytedance\/seedance-2\.0\/(?:fast\/|mini\/|us\/)?reference-to-video$/.test(
      endpoint,
    )
  )
    return 3;
  if (/^bytedance\/seedance-2\.5\/(?:us\/)?reference-to-video$/.test(endpoint))
    return 10;
  return null;
}

/** Pure validation and hashing: no caller URL, timestamp or selector is evidence. */
export function bindSeedanceVideoReferences(
  endpoint: string,
  organizationId: string,
  references: readonly SeedanceVideoReferenceEvidence[],
): SeedanceReferenceQuoteEvidence {
  const limit = seedanceVideoReferenceLimit(endpoint);
  const fail = (): never => {
    throw new BadRequestException({
      code: 'SEEDANCE_REFERENCE_EVIDENCE_INVALID',
    });
  };
  if (
    !limit ||
    !organizationId ||
    !references.length ||
    references.length > limit
  )
    return fail();
  const v25 = endpoint.includes('seedance-2.5/');
  for (const reference of references) {
    const { width, height, duration, framesPerSecond, sizeBytes } = reference;
    if (
      !reference.assetId ||
      !reference.sourceKey ||
      reference.organizationId !== organizationId ||
      !/^[a-f0-9]{64}$/.test(reference.sourceVersion) ||
      ![width, height, sizeBytes].every(
        (value) => Number.isSafeInteger(value) && value > 0,
      ) ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      !Number.isFinite(framesPerSecond) ||
      framesPerSecond <= 0
    )
      return fail();
    if (v25) {
      if (
        duration < 1.8 ||
        duration > 30.2 ||
        sizeBytes > 200_000_000 ||
        Math.min(width, height) < 300 ||
        Math.max(width, height) > 6000 ||
        width / height < 0.4 ||
        width / height > 2.5 ||
        framesPerSecond < 24 ||
        framesPerSecond > 60
      )
        return fail();
    } else if (width * height < 640 * 640 || width * height > 834 * 1112) {
      return fail();
    }
  }
  const inputDuration = references.reduce(
    (total, reference) => total + reference.duration,
    0,
  );
  if (
    !Number.isFinite(inputDuration) ||
    (v25 ? inputDuration > 30.2 : inputDuration < 2 || inputDuration > 15) ||
    (!v25 &&
      references.reduce((total, reference) => total + reference.sizeBytes, 0) >=
        50_000_000)
  )
    return fail();
  // Ordering is provider ordering. Signed transport URLs and probe timestamps
  // change without changing asset identity, bytes or measured billable usage.
  const canonical = references.map((reference) => ({
    assetId: reference.assetId,
    organizationId: reference.organizationId,
    sourceKey: reference.sourceKey,
    sourceVersion: reference.sourceVersion,
    duration: reference.duration,
    width: reference.width,
    height: reference.height,
    framesPerSecond: reference.framesPerSecond,
    sizeBytes: reference.sizeBytes,
  }));
  return {
    inputDuration,
    referenceEvidenceHash: createHash('sha256')
      .update(
        JSON.stringify({ endpoint, organizationId, references: canonical }),
      )
      .digest('hex'),
  };
}

export function assertSeedanceReferenceBinding(
  expected: SeedanceReferenceQuoteEvidence,
  actual: SeedanceReferenceQuoteEvidence,
): void {
  if (
    !/^[a-f0-9]{64}$/.test(expected.referenceEvidenceHash) ||
    expected.referenceEvidenceHash !== actual.referenceEvidenceHash ||
    expected.inputDuration !== actual.inputDuration
  )
    throw new BadRequestException({
      code: 'SEEDANCE_REFERENCE_EVIDENCE_CHANGED',
    });
}

export function assertPreparedSeedanceReferenceUrls(
  references: readonly SeedanceVideoReferenceEvidence[],
  urls: unknown,
): void {
  if (
    !Array.isArray(urls) ||
    urls.length !== references.length ||
    references.some((reference, index) => urls[index] !== reference.url)
  )
    throw new BadRequestException({
      code: 'SEEDANCE_REFERENCE_EVIDENCE_CHANGED',
    });
}

export const MAX_SEEDANCE_REFERENCE_VIDEO_SECONDS = 30;

export function assertSeedanceReferenceVideoDuration(
  durations: readonly number[],
): void {
  if (
    durations.reduce((total, duration) => total + duration, 0) >
    MAX_SEEDANCE_REFERENCE_VIDEO_SECONDS
  ) {
    throw new HttpException(
      {
        detail: `Seedance reference videos may total at most ${MAX_SEEDANCE_REFERENCE_VIDEO_SECONDS} seconds`,
        title: 'Invalid video reference duration',
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export function assertReplicateVideoReference(
  duration: unknown,
  hasStoredKey: boolean,
  authorizedDelivery: boolean,
  role: string,
): asserts duration is number {
  if (
    typeof duration !== 'number' ||
    !Number.isFinite(duration) ||
    duration < 3 ||
    duration > 10
  )
    throw new HttpException(
      {
        detail: `The ${role} reference must be a video between 3 and 10 seconds`,
        title: 'Invalid video reference duration',
      },
      HttpStatus.BAD_REQUEST,
    );
  if (authorizedDelivery && !hasStoredKey)
    throw new HttpException(
      'The source video has no stored media key',
      HttpStatus.BAD_REQUEST,
    );
}
