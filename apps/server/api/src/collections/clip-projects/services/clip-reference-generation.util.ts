import type { ClipProjectDocument } from '@api/collections/clip-projects/schemas/clip-project.schema';
import {
  CLIP_REFERENCE_FRAME_SCHEMA_VERSION,
  type ClipReferenceApplication,
  type ClipReferenceFrameCandidate,
  type ClipReferencePolicy,
  type ClipReferenceProvenance,
  type ClipResultMode,
} from '@genfeedai/interfaces';
import type { AvatarVideoProviderName } from '@genfeedai/queue-contracts';
import { BadRequestException } from '@nestjs/common';

export type ClipReferenceRoute =
  | {
      mode: 'avatar';
      provider: AvatarVideoProviderName;
    }
  | {
      mode: 'raw-cut';
      provider: 'raw-cut';
    };

export interface ClipReferenceCapability {
  nativeField?: string;
  reason?: string;
  supported: boolean;
}

export interface ResolvedClipReference {
  application?: ClipReferenceApplication;
  referenceImageUrl?: string;
}

type ClipReferenceCapabilityMatrix = {
  [Mode in ClipResultMode]: Mode extends 'avatar'
    ? Record<AvatarVideoProviderName, ClipReferenceCapability>
    : Mode extends 'raw-cut'
      ? Record<'raw-cut', ClipReferenceCapability>
      : never;
};

const UNSUPPORTED_AVATAR_REFERENCE_REASON =
  'The selected avatar provider cannot use the selected reference image.';
const UNSUPPORTED_RAW_CUT_REFERENCE_REASON =
  'Raw-cut generation preserves source footage and cannot apply a separate reference image.';

export const CLIP_REFERENCE_CAPABILITIES = {
  avatar: {
    did: {
      reason: UNSUPPORTED_AVATAR_REFERENCE_REASON,
      supported: false,
    },
    heygen: {
      nativeField: 'photo_url',
      supported: true,
    },
    musetalk: {
      reason: UNSUPPORTED_AVATAR_REFERENCE_REASON,
      supported: false,
    },
    tavus: {
      reason: UNSUPPORTED_AVATAR_REFERENCE_REASON,
      supported: false,
    },
  },
  'raw-cut': {
    'raw-cut': {
      reason: UNSUPPORTED_RAW_CUT_REFERENCE_REASON,
      supported: false,
    },
  },
} as const satisfies ClipReferenceCapabilityMatrix;

const unsafeStorageKeySegment = /(^|[\\/])\.\.([\\/]|$)/;
const sensitiveQueryKey =
  /^(?:x-amz-|x-goog-|awsaccesskeyid$|credential$|expires?$|signature$|sig$|token$|access_token$)/i;

export function resolveSelectedClipReference(input: {
  mode: ClipResultMode;
  policy: ClipReferencePolicy;
  project: ClipProjectDocument;
  provider: AvatarVideoProviderName;
}): ResolvedClipReference {
  const selectedCandidateId =
    input.project.referenceFrames?.selectedCandidateId;

  if (!selectedCandidateId) {
    return {};
  }

  const candidate = input.project.referenceFrames?.candidates.find(
    (item) => item.id === selectedCandidateId,
  );

  if (candidate?.status !== 'available') {
    throw new BadRequestException(
      'The selected clip reference is missing or no longer available.',
    );
  }

  assertSafeCandidate(candidate);

  const route = resolveRoute(input.mode, input.provider);
  const capability = resolveCapability(route);
  const provenance = buildProvenance(candidate, route, capability);

  if (!capability.supported) {
    const reason =
      capability.reason ?? 'The selected route cannot use a reference image.';

    if (input.policy === 'strict') {
      throw new BadRequestException(reason);
    }

    return {
      application: {
        provenance: {
          ...provenance,
          application: {
            ...provenance.application,
            reason,
            state: 'degraded',
          },
        },
        reason,
        state: 'degraded',
      },
    };
  }

  const referenceImageUrl = requireStableReferenceUrl(candidate.url);

  return {
    application: {
      provenance,
      state: 'applied',
    },
    referenceImageUrl,
  };
}

function resolveRoute(
  mode: ClipResultMode,
  provider: AvatarVideoProviderName,
): ClipReferenceRoute {
  return mode === 'raw-cut'
    ? { mode, provider: 'raw-cut' }
    : { mode, provider };
}

function resolveCapability(route: ClipReferenceRoute): ClipReferenceCapability {
  return route.mode === 'raw-cut'
    ? CLIP_REFERENCE_CAPABILITIES['raw-cut'][route.provider]
    : CLIP_REFERENCE_CAPABILITIES.avatar[route.provider];
}

function buildProvenance(
  candidate: ClipReferenceFrameCandidate,
  route: ClipReferenceRoute,
  capability: ClipReferenceCapability,
): ClipReferenceProvenance {
  return {
    application: {
      mode: route.mode,
      ...(capability.nativeField
        ? { nativeField: capability.nativeField }
        : {}),
      provider: route.provider,
      state: 'applied',
    },
    schemaVersion: CLIP_REFERENCE_FRAME_SCHEMA_VERSION,
    source: {
      ...(candidate.assetId ? { assetId: candidate.assetId } : {}),
      candidateId: candidate.id,
      ...(candidate.mimeType ? { mimeType: candidate.mimeType } : {}),
      ...(candidate.storageKey ? { storageKey: candidate.storageKey } : {}),
      timestampSeconds: candidate.timestampSeconds,
    },
  };
}

function assertSafeCandidate(candidate: ClipReferenceFrameCandidate): void {
  if (candidate.mimeType && !candidate.mimeType.startsWith('image/')) {
    throw new BadRequestException(
      'The selected clip reference is not safe image media.',
    );
  }

  if (
    candidate.storageKey &&
    (candidate.storageKey.startsWith('/') ||
      candidate.storageKey.startsWith('\\') ||
      unsafeStorageKeySegment.test(candidate.storageKey))
  ) {
    throw new BadRequestException(
      'The selected clip reference has an unsafe storage identity.',
    );
  }

  if (!candidate.assetId && !candidate.storageKey && !candidate.url) {
    throw new BadRequestException(
      'The selected clip reference has no stable media identity.',
    );
  }

  if (candidate.url) {
    requireStableReferenceUrl(candidate.url);
  }
}

function requireStableReferenceUrl(value?: string): string {
  if (!value) {
    throw new BadRequestException(
      'The selected clip reference has no provider-readable image URL.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new BadRequestException(
      'The selected clip reference has an unsafe image URL.',
    );
  }

  const hasSensitiveQuery = [...parsed.searchParams.keys()].some((key) =>
    sensitiveQueryKey.test(key),
  );
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    hasSensitiveQuery
  ) {
    throw new BadRequestException(
      'The selected clip reference has an unsafe or transient image URL.',
    );
  }

  return parsed.toString();
}
