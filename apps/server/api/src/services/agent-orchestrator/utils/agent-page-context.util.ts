import type { AgentPageContext } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import type { AgentArtifactReference } from '@genfeedai/interfaces';

const MAX_PAGE_CONTEXT_FIELD_LENGTH = 4_000;
const MAX_PAGE_CONTEXT_ARTIFACT_REFERENCES = 20;

function clampPageContextField(value?: string): string | null {
  const normalized = value?.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return null;
  }

  return normalized.length <= MAX_PAGE_CONTEXT_FIELD_LENGTH
    ? normalized
    : `${normalized.slice(0, MAX_PAGE_CONTEXT_FIELD_LENGTH)}...`;
}

export function buildPageContextPrompt(
  pageContext?: AgentPageContext,
  artifactReferences?: AgentArtifactReference[],
): string {
  if (!pageContext && !artifactReferences?.length) {
    return '';
  }

  const fields = [
    ['Route', pageContext?.route || pageContext?.url],
    ['Draft type', pageContext?.draftType],
    ['Format', pageContext?.contentFormat],
    ['Title', pageContext?.draftTitle],
    ['Summary', pageContext?.draftSummary],
    ['Instructions', pageContext?.draftInstructions],
    ['Selected text', pageContext?.selectedText],
    ['Draft body', pageContext?.draftBody || pageContext?.postContent],
  ]
    .map(([label, value]) => {
      const clamped = clampPageContextField(value);
      return clamped ? `- ${label}: ${clamped}` : null;
    })
    .filter(Boolean)
    .join('\n');
  const selectedRecords = artifactReferences
    ?.slice(0, MAX_PAGE_CONTEXT_ARTIFACT_REFERENCES)
    ?.map(
      (reference) =>
        `- ${reference.kind}:${reference.recordId}${reference.brandId ? ` (brand ${reference.brandId})` : ''}`,
    )
    .join('\n');

  return [
    fields
      ? `## Current Page Context\nThe user is working in a visible Genfeed surface. Use this context when answering, especially for writing co-pilot requests. Propose edits, structure, or next actions against the current draft instead of starting from scratch unless asked.\n${fields}`
      : null,
    selectedRecords
      ? `## Selected Canonical Records\nThese records were selected explicitly and authorized before this turn executes:\n${selectedRecords}\nUse the exact record ids when relevant. Selection is not approval and does not authorize a consequential action.`
      : null,
  ]
    .filter(Boolean)
    .map((section) => `\n\n${section}`)
    .join('');
}
