import { createHash } from 'node:crypto';
import { ValidationException } from '@api/exceptions/validation.exception';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { traced } from '@libs/tracing/traced';

const MOTION_CONTROL_MIN_REFERENCE_SECONDS = 3;
/** Kling: the output is as long as the reference video, capped by who sets the orientation. */
const MOTION_CONTROL_MAX_REFERENCE_SECONDS = {
  image: 10,
  video: 30,
} as const;
const MOTION_CONTROL_MAX_REFERENCE_BYTES = 100_000_000;

export type MotionControlOrientation =
  keyof typeof MOTION_CONTROL_MAX_REFERENCE_SECONDS;

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

/** Measured from the stored bytes of a tenant-scoped asset; no caller value is evidence. */
export interface MotionControlReferenceEvidence {
  assetId: string;
  durationSeconds: number;
  organizationId: string;
  sizeBytes: number;
  sourceKey: string;
  sourceVersion: string;
}

/** The billable quantities a quote may take from the measured reference. */
export interface MotionControlQuoteEvidence {
  /** Whole seconds, rounded up so the hold never falls below the output. */
  duration: number;
  referenceEvidenceHash: string;
}

type MotionControlReferenceFiles = Pick<
  FilesClientService,
  | 'fingerprintMedia'
  | 'getPresignedDownloadUrlForObjectKey'
  | 'probeMediaFromUrl'
>;

function changed(): never {
  throw new ValidationException(
    'The motion reference video changed while it was being measured. Run the workflow again.',
    'video',
  );
}

/** Measures the stored reference twice, so bytes that change under us never price a run. */
export const measureMotionControlReference = traced(
  'measureMotionControlReference',
  async (
    files: MotionControlReferenceFiles,
    input: { assetId: string; organizationId: string; sourceKey: string },
  ): Promise<MotionControlReferenceEvidence> => {
    const url = await files.getPresignedDownloadUrlForObjectKey(
      input.sourceKey,
    );
    const before = await files.fingerprintMedia(url);
    const probe = await files.probeMediaFromUrl(url, 'video');
    const after = await files.fingerprintMedia(url);
    if (
      before.assetHash !== after.assetHash ||
      before.sizeBytes !== after.sizeBytes ||
      probe.sizeBytes !== after.sizeBytes
    )
      return changed();
    if (
      probe.durationSeconds === null ||
      !Number.isFinite(probe.durationSeconds) ||
      probe.durationSeconds <= 0
    )
      throw new ValidationException(
        'The motion reference video has no readable duration. Choose a finished .mp4 or .mov video.',
        'video',
      );
    return {
      assetId: input.assetId,
      durationSeconds: probe.durationSeconds,
      organizationId: input.organizationId,
      sizeBytes: after.sizeBytes,
      sourceKey: input.sourceKey,
      sourceVersion: after.assetHash,
    };
  },
);

/** Pure validation against the provider's limits, then the evidence a quote is bound to. */
export function bindMotionControlReference(input: {
  evidence: MotionControlReferenceEvidence;
  modelKey: string;
  orientation: MotionControlOrientation;
  organizationId: string;
}): MotionControlQuoteEvidence {
  const { evidence, orientation } = input;
  if (
    !evidence.assetId ||
    !evidence.sourceKey ||
    evidence.organizationId !== input.organizationId ||
    !SHA256_HEX_PATTERN.test(evidence.sourceVersion) ||
    !Number.isSafeInteger(evidence.sizeBytes) ||
    evidence.sizeBytes <= 0
  )
    return changed();
  if (evidence.sizeBytes > MOTION_CONTROL_MAX_REFERENCE_BYTES)
    throw new ValidationException(
      'The motion reference video is larger than 100 MB. Choose a smaller video.',
      'video',
    );
  const max = MOTION_CONTROL_MAX_REFERENCE_SECONDS[orientation];
  if (
    evidence.durationSeconds < MOTION_CONTROL_MIN_REFERENCE_SECONDS ||
    evidence.durationSeconds > max
  )
    throw new ValidationException(
      orientation === 'image'
        ? `The motion reference video must be ${MOTION_CONTROL_MIN_REFERENCE_SECONDS} to ${max} seconds when the character keeps the image's orientation. Trim the video, or set the orientation to video for up to ${MOTION_CONTROL_MAX_REFERENCE_SECONDS.video} seconds.`
        : `The motion reference video must be ${MOTION_CONTROL_MIN_REFERENCE_SECONDS} to ${max} seconds. Trim the video.`,
      'video',
      evidence.durationSeconds,
    );
  // Signed transport URLs and probe timestamps change without changing asset
  // identity, bytes or measured usage, so none of them is part of the hash.
  return {
    duration: Math.ceil(evidence.durationSeconds),
    referenceEvidenceHash: createHash('sha256')
      .update(
        JSON.stringify({
          assetId: evidence.assetId,
          durationSeconds: evidence.durationSeconds,
          modelKey: input.modelKey,
          organizationId: evidence.organizationId,
          orientation,
          sizeBytes: evidence.sizeBytes,
          sourceKey: evidence.sourceKey,
          sourceVersion: evidence.sourceVersion,
        }),
      )
      .digest('hex'),
  };
}
