import type { AgentPageContext } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';

const MAX_PAGE_CONTEXT_FIELD_LENGTH = 4_000;

function clampPageContextField(value?: string): string | null {
  const normalized = value?.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return null;
  }

  return normalized.length <= MAX_PAGE_CONTEXT_FIELD_LENGTH
    ? normalized
    : `${normalized.slice(0, MAX_PAGE_CONTEXT_FIELD_LENGTH)}...`;
}

export function buildPageContextPrompt(pageContext?: AgentPageContext): string {
  if (!pageContext) {
    return '';
  }

  const fields = [
    ['Route', pageContext.route || pageContext.url],
    ['Draft type', pageContext.draftType],
    ['Format', pageContext.contentFormat],
    ['Title', pageContext.draftTitle],
    ['Summary', pageContext.draftSummary],
    ['Instructions', pageContext.draftInstructions],
    ['Selected text', pageContext.selectedText],
    ['Draft body', pageContext.draftBody || pageContext.postContent],
  ]
    .map(([label, value]) => {
      const clamped = clampPageContextField(value);
      return clamped ? `- ${label}: ${clamped}` : null;
    })
    .filter(Boolean)
    .join('\n');

  return fields
    ? `\n\n## Current Page Context\nThe user is working in a visible Genfeed surface. Use this context when answering, especially for writing co-pilot requests. Propose edits, structure, or next actions against the current draft instead of starting from scratch unless asked.\n${fields}`
    : '';
}
