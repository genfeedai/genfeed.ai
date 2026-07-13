import {
  AGENT_ARTIFACT_SERIALIZER_BY_KIND,
  type AgentArtifactReference,
} from '@genfeedai/interfaces';

export const LIBRARY_REMIX_SOURCE_QUERY_KEY = 'sourceArtifact';

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
}): LibraryArtifactReference | null {
  const { brandId, kind, organizationId, recordId } = params;
  if (!brandId.trim() || !organizationId.trim() || !isSafeOpaqueId(recordId)) {
    return null;
  }

  return {
    brandId,
    kind,
    organizationId,
    recordId,
    serializer: AGENT_ARTIFACT_SERIALIZER_BY_KIND[kind],
  } as LibraryArtifactReference;
}

export function encodeLibraryRemixSource(
  reference: LibraryArtifactReference,
): string {
  return `${reference.kind}:${reference.recordId}`;
}

export function parseLibraryRemixSource(
  value: string | null | undefined,
  context: { readonly brandId: string; readonly organizationId: string },
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
  });
}

export function buildLibraryRemixIntentHref(
  href: string,
  reference: LibraryArtifactReference,
): string {
  const url = new URL(href, 'https://workspace.genfeed.invalid');
  url.searchParams.set(
    LIBRARY_REMIX_SOURCE_QUERY_KEY,
    encodeLibraryRemixSource(reference),
  );
  url.searchParams.delete('overlay');
  url.searchParams.delete('overlayRef');

  return `${url.pathname}${url.search}${url.hash}`;
}

export function readRelationshipId(
  value: { readonly id?: string } | string | null | undefined,
): string | null {
  if (typeof value === 'string') {
    return value || null;
  }

  return value?.id || null;
}
