import {
  AGENT_ARTIFACT_SERIALIZER_BY_KIND,
  type AgentArtifactReference,
} from '@genfeedai/interfaces';
import {
  buildContextualRemixHref,
  CONTEXTUAL_REMIX_SOURCE_QUERY_KEY,
  CONTEXTUAL_REMIX_SOURCE_VERSION_QUERY_KEY,
  encodeContextualRemixSource,
} from '@genfeedai/utils/url/contextual-remix-url.util';

export const LIBRARY_REMIX_SOURCE_QUERY_KEY = CONTEXTUAL_REMIX_SOURCE_QUERY_KEY;
export const LIBRARY_REMIX_SOURCE_VERSION_QUERY_KEY =
  CONTEXTUAL_REMIX_SOURCE_VERSION_QUERY_KEY;

export type LibraryArtifactReference = Extract<
  AgentArtifactReference,
  { kind: 'asset' | 'ingredient' }
>;

const LIBRARY_ARTIFACT_KINDS = Object.freeze(['asset', 'ingredient'] as const);

function isSafeOpaqueId(value: string): boolean {
  return (
    value.length > 0 &&
    value !== 'undefined' &&
    value !== 'null' &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

export function buildLibraryArtifactReference(params: {
  readonly brandId: string;
  readonly kind: LibraryArtifactReference['kind'];
  readonly organizationId: string;
  readonly recordId: string;
  readonly recordVersion?: string;
}): LibraryArtifactReference | null {
  const { brandId, kind, organizationId, recordId, recordVersion } = params;
  if (!brandId.trim() || !organizationId.trim() || !isSafeOpaqueId(recordId)) {
    return null;
  }
  if (recordVersion && !/^[A-Za-z0-9._-]+$/.test(recordVersion)) {
    return null;
  }

  return {
    brandId,
    kind,
    organizationId,
    recordId,
    ...(recordVersion ? { recordVersion } : {}),
    serializer: AGENT_ARTIFACT_SERIALIZER_BY_KIND[kind],
  } as LibraryArtifactReference;
}

export function encodeLibraryRemixSource(
  reference: LibraryArtifactReference,
): string {
  return encodeContextualRemixSource(reference);
}

export function parseLibraryRemixSource(
  value: string | null | undefined,
  context: { readonly brandId: string; readonly organizationId: string },
  recordVersion?: string | null,
): LibraryArtifactReference | null {
  if (!value) {
    return null;
  }

  const separatorIndex = value.indexOf(':');
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
    return null;
  }

  const kind = value.slice(0, separatorIndex);
  if (
    !LIBRARY_ARTIFACT_KINDS.includes(
      kind as (typeof LIBRARY_ARTIFACT_KINDS)[number],
    )
  ) {
    return null;
  }

  return buildLibraryArtifactReference({
    ...context,
    kind: kind as LibraryArtifactReference['kind'],
    recordId: value.slice(separatorIndex + 1),
    recordVersion: recordVersion || undefined,
  });
}

export function buildLibraryRemixIntentHref(
  href: string,
  reference: LibraryArtifactReference,
): string {
  return buildContextualRemixHref(href, reference);
}

export function readRelationshipId(
  value: { readonly id?: string } | string | null | undefined,
): string | null {
  if (typeof value === 'string') {
    return value || null;
  }

  return value?.id || null;
}
