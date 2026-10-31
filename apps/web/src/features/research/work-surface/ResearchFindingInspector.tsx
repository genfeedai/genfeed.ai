'use client';

import type { ReactElement } from 'react';

import type { AuthorizedResearchFinding } from './research-work-surface.types';

/**
 * Detail for the selected research finding, rendered inside the context
 * sidebar. Title, kind and close live in the sidebar header.
 */
export default function ResearchFindingInspector({
  finding,
}: {
  readonly finding: AuthorizedResearchFinding;
}): ReactElement {
  return (
    <div
      className="space-y-4 px-4 py-4"
      data-testid="research-finding-inspector"
    >
      {finding.description ? (
        <p className="text-xs leading-5 text-foreground/70">
          {finding.description}
        </p>
      ) : null}
      {finding.metadata.length > 0 ? (
        <dl className="space-y-2">
          {finding.metadata.map((item) => (
            <div
              className="flex items-start justify-between gap-3 text-xs"
              key={`${item.label}:${item.value}`}
            >
              <dt className="text-muted-foreground">{item.label}</dt>
              <dd className="text-right text-foreground/80">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
