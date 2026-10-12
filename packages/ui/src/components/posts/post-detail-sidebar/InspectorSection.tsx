'use client';

import type { InspectorSectionProps } from '@genfeedai/props/components/post-detail-sidebar.props';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';

/**
 * One hairline section of the post inspector: a full-width header (title left,
 * one-line muted summary right, chevron) over a collapsible body. Sections
 * separate with a bottom border only, so there is no card chrome or nesting.
 */
export default function InspectorSection({
  title,
  summary,
  children,
  isDefaultOpen = false,
  isMountedWhenClosed = false,
  testId,
}: InspectorSectionProps) {
  return (
    <Collapsible
      defaultOpen={isDefaultOpen}
      className="border-b border-border"
      data-testid={testId}
    >
      <CollapsibleTrigger className="gap-3 py-3 hover:no-underline">
        <span className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left">
          <span className="shrink-0 text-sm font-medium">{title}</span>
          {summary ? (
            <span className="min-w-0 truncate text-xs font-normal text-muted-foreground">
              {summary}
            </span>
          ) : null}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent
        className="data-[state=closed]:hidden"
        {...(isMountedWhenClosed ? { forceMount: true } : {})}
      >
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
