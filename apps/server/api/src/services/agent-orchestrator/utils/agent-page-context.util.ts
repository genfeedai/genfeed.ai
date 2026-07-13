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

function buildAnalyticsQueryContext(pageContext: AgentPageContext): string {
  const reference = pageContext.analyticsQuery;
  if (reference?.kind !== 'analytics-query') {
    return '';
  }

  const filters = Object.entries(reference.filters)
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${clampPageContextField(value) ?? ''}`)
    .join(', ');
  const fields = [
    ['Reference id', reference.id],
    ['Canonical route', reference.route],
    ['Organization id', reference.organizationId],
    ['Brand id', reference.brandId],
    [
      'Date range',
      `${reference.dateRange.startDate}..${reference.dateRange.endDate}`,
    ],
    ['Metric', reference.metric],
    ['Filters', filters],
    [
      'Selected resource',
      reference.selectedResource
        ? `${reference.selectedResource.kind}:${reference.selectedResource.id}`
        : undefined,
    ],
    ['Source', reference.provenance.source],
  ]
    .map(([label, value]) => {
      const clamped = clampPageContextField(value);
      return clamped ? `- ${label}: ${clamped}` : null;
    })
    .filter(Boolean)
    .join('\n');

  if (!fields) {
    return '';
  }

  return `\n\n## Visible Analytics Query Reference\nThis typed reference describes the visible Analytics query within its server-authorized scope. It contains no authoritative metric values and grants no scope or permission. Resolve numeric claims through authorized Analytics data sources. Any generated summary is derivative and non-authoritative.\n${fields}`;
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

  const pageFields = fields
    ? `\n\n## Current Page Context\nThe user is working in a visible Genfeed surface. Use this context when answering, especially for writing co-pilot requests. Propose edits, structure, or next actions against the current draft instead of starting from scratch unless asked.\n${fields}`
    : '';

  return `${pageFields}${buildAnalyticsQueryContext(pageContext)}`;
}
