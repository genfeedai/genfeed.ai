import type { AgentArtifactReference } from '@genfeedai/interfaces';

export const CONTEXTUAL_REMIX_SOURCE_QUERY_KEY = 'sourceArtifact';
export const CONTEXTUAL_REMIX_SOURCE_VERSION_QUERY_KEY = 'sourceVersion';

type ContextualRemixArtifactReference = Extract<
  AgentArtifactReference,
  { kind: 'asset' | 'ingredient' }
>;

export type ContextualRemixSourceReference = Pick<
  ContextualRemixArtifactReference,
  'kind' | 'recordId' | 'recordVersion'
>;

export function encodeContextualRemixSource(
  reference: ContextualRemixSourceReference,
): string {
  return `${reference.kind}:${reference.recordId}`;
}

export function buildContextualRemixHref(
  href: string,
  reference: ContextualRemixSourceReference,
): string {
  const url = new URL(href, 'https://workspace.genfeed.invalid');
  url.searchParams.set(
    CONTEXTUAL_REMIX_SOURCE_QUERY_KEY,
    encodeContextualRemixSource(reference),
  );

  if (reference.recordVersion) {
    url.searchParams.set(
      CONTEXTUAL_REMIX_SOURCE_VERSION_QUERY_KEY,
      reference.recordVersion,
    );
  } else {
    url.searchParams.delete(CONTEXTUAL_REMIX_SOURCE_VERSION_QUERY_KEY);
  }

  url.searchParams.delete('overlay');
  url.searchParams.delete('overlayRef');

  return `${url.pathname}${url.search}${url.hash}`;
}
