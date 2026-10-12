'use client';

import type { InspectorSectionProps } from '@genfeedai/props/components/post-detail-sidebar.props';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import { useState } from 'react';

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
  const [isOpen, setIsOpen] = useState(isDefaultOpen);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="border-b border-border"
      data-testid={testId}
    >
      <CollapsibleTrigger className="gap-3 py-3 hover:no-underline">
        <span className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left">
          <span className="shrink-0 text-sm font-medium">{title}</span>{' '}
          {summary ? (
            <span className="min-w-0 truncate text-xs font-normal text-muted-foreground">
              {summary}
            </span>
          ) : null}
        </span>
      </CollapsibleTrigger>
      {/* A body kept mounted while closed (so it can keep reporting state,
          e.g. TikTok readiness) is hidden with the attribute, not just CSS. */}
      <CollapsibleContent
        {...(isMountedWhenClosed ? { forceMount: true, hidden: !isOpen } : {})}
      >
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
