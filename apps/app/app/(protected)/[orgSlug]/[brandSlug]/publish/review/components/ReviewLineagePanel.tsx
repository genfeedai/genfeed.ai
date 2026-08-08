'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { IBatchItem } from '@genfeedai/interfaces';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionTerm,
} from '@genfeedai/ui';
import { Button } from '@ui/primitives/button';
import NextLink from 'next/link';

type ReviewPanelItem = IBatchItem & {
  gateOverallScore?: number;
  gateReasons?: string[];
  opportunitySourceType?: 'trend' | 'event' | 'evergreen';
  opportunityTopic?: string;
};

interface ReviewLineagePanelProps {
  item: ReviewPanelItem;
}

export default function ReviewLineagePanel({ item }: ReviewLineagePanelProps) {
  return (
    <div className="space-y-3 border-b border-border px-4 py-4 last:border-b-0">
      <h3 className="text-sm font-medium text-foreground">Lineage</h3>
      <DefinitionList className="text-sm">
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>Topic</DefinitionTerm>
          <DefinitionDetail variant="value">
            {item.opportunityTopic ?? 'Not recorded'}
          </DefinitionDetail>
        </div>
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>Source type</DefinitionTerm>
          <DefinitionDetail variant="value" className="capitalize">
            {item.opportunitySourceType ?? 'Not recorded'}
          </DefinitionDetail>
        </div>
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>Workflow</DefinitionTerm>
          <DefinitionDetail variant="value">
            {item.sourceWorkflowName ?? item.sourceWorkflowId ?? 'Not recorded'}
          </DefinitionDetail>
        </div>
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>Action</DefinitionTerm>
          <DefinitionDetail variant="value">
            {item.sourceActionId ?? 'Not recorded'}
          </DefinitionDetail>
        </div>
      </DefinitionList>

      {item.sourceWorkflowId ? (
        <Button
          asChild
          className="h-8 px-0 text-xs"
          variant={ButtonVariant.LINK}
          withWrapper={false}
        >
          <NextLink
            href={`/automate/${item.sourceWorkflowId}${
              item.sourceActionId ? `?opportunity=${item.sourceActionId}` : ''
            }`}
          >
            Open strategy
          </NextLink>
        </Button>
      ) : null}

      {item.postId ? (
        <Button
          asChild
          className="h-8 px-0 text-xs"
          variant={ButtonVariant.LINK}
          withWrapper={false}
        >
          <NextLink href={`/publish/${item.postId}`}>Open draft</NextLink>
        </Button>
      ) : null}
    </div>
  );
}
