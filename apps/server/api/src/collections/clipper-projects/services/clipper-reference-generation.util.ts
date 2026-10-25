import type { ClipperProjectDocument } from '@api/collections/clipper-projects/schemas/clipper-project.schema';
import type { AvatarVideoProviderName } from '@genfeedai/contracts/interfaces';
import {
  CLIPPER_REFERENCE_FRAME_SCHEMA_VERSION,
  type ClipperReferenceApplication,
  type ClipperReferenceFrameCandidate,
  type ClipperReferencePolicy,
  type ClipperReferenceProvenance,
  type ClipperResultMode,
} from '@genfeedai/contracts/interfaces';
import { BadRequestException } from '@nestjs/common';

export type ClipperReferenceRoute =
  | {
      mode: 'avatar';
      provider: AvatarVideoProviderName;
    }
  | {
      mode: 'raw-cut';
      provider: 'raw-cut';
    };

export interface ClipperReferenceCapability {
  nativeField?: string;
  reason?: string;
  supported: boolean;
}

export interface ResolvedClipperReference {
  application?: ClipperReferenceApplication;
  referenceImageUrl?: string;
}

type ClipperReferenceCapabilityMatrix = {
  [Mode in ClipperResultMode]: Mode extends 'avatar'
    ? Record<AvatarVideoProviderName, ClipperReferenceCapability>
    : Mode extends 'raw-cut'
      ? Record<'raw-cut', ClipperReferenceCapability>
      : never;
};

const UNSUPPORTED_AVATAR_REFERENCE_REASON =
  'The selected avatar provider cannot use the selected reference image.';
const UNSUPPORTED_RAW_CUT_REFERENCE_REASON =
  'Raw-cut generation preserves source footage and cannot apply a separate reference image.';

export const CLIPPER_REFERENCE_CAPABILITIES = {
  avatar: {
    argil: {
      reason: UNSUPPORTED_AVATAR_REFERENCE_REASON,
      supported: false,
    },
    did: {
      reason: UNSUPPORTED_AVATAR_REFERENCE_REASON,
      supported: false,
    },
    genfeedai: {
      nativeField: 'imageUrl',
      supported: true,
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
} as const satisfies ClipperReferenceCapabilityMatrix;

const unsafeStorageKeySegment = /(^|[\\/])\.\.([\\/]|$)/;
const urlLikeStorageKey = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const credentialBearingStorageKey =
  /(?:^|[/?&#;])(?:x-amz-[^=/?&#;]*|x-goog-[^=/?&#;]*|awsaccesskeyid|credential|expires?|signature|sig|token|access_token|api[_-]?key)=/i;
const embeddedStorageCredentials = /(?:^|[\\/])[^\\/:@\s]+:[^\\/@\s]+@/;
const sensitiveQueryKey =
  /^(?:x-amz-|x-goog-|awsaccesskeyid$|credential$|expires?$|signature$|sig$|token$|access_token$)/i;

export function resolveSelectedClipperReference(input: {
  mode: ClipperResultMode;
  policy: ClipperReferencePolicy;
  project: ClipperProjectDocument;
  provider: AvatarVideoProviderName;
}): ResolvedClipperReference {
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
  mode: ClipperResultMode,
  provider: AvatarVideoProviderName,
): ClipperReferenceRoute {
  return mode === 'raw-cut'
    ? { mode, provider: 'raw-cut' }
    : { mode, provider };
}

function resolveCapability(
  route: ClipperReferenceRoute,
): ClipperReferenceCapability {
  return route.mode === 'raw-cut'
    ? CLIPPER_REFERENCE_CAPABILITIES['raw-cut'][route.provider]
    : CLIPPER_REFERENCE_CAPABILITIES.avatar[route.provider];
}

function buildProvenance(
  candidate: ClipperReferenceFrameCandidate,
  route: ClipperReferenceRoute,
  capability: ClipperReferenceCapability,
): ClipperReferenceProvenance {
  const storageKey = candidate.storageKey
    ? requireStableStorageKey(candidate.storageKey)
    : undefined;

  return {
    application: {
      mode: route.mode,
      ...(capability.nativeField
        ? { nativeField: capability.nativeField }
        : {}),
      provider: route.provider,
      state: 'applied',
    },
    schemaVersion: CLIPPER_REFERENCE_FRAME_SCHEMA_VERSION,
    source: {
      ...(candidate.assetId ? { assetId: candidate.assetId } : {}),
      candidateId: candidate.id,
      ...(candidate.mimeType ? { mimeType: candidate.mimeType } : {}),
      ...(storageKey ? { storageKey } : {}),
      timestampSeconds: candidate.timestampSeconds,
    },
  };
}

function assertSafeCandidate(candidate: ClipperReferenceFrameCandidate): void {
  if (!candidate.mimeType?.startsWith('image/')) {
    throw new BadRequestException(
      'The selected clip reference is not safe image media.',
    );
  }

  if (candidate.storageKey) {
    requireStableStorageKey(candidate.storageKey);
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

function requireStableStorageKey(value: string): string {
  if (
    value.startsWith('/') ||
    value.startsWith('\\') ||
    unsafeStorageKeySegment.test(value) ||
    hasControlCharacter(value) ||
    urlLikeStorageKey.test(value) ||
    value.includes('?') ||
    value.includes('#') ||
    credentialBearingStorageKey.test(value) ||
    embeddedStorageCredentials.test(value)
  ) {
    throw new BadRequestException(
      'The selected clip reference has an unsafe storage identity.',
    );
  }

  return value;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
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
