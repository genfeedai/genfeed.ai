'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { IBatchItem } from '@genfeedai/interfaces';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionTerm,
} from '@genfeedai/ui';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
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
    <InsetSurface className="p-5" tone="contrast">
      <h3 className="text-sm font-medium text-foreground">Lineage</h3>
      <DefinitionList className="mt-4 text-sm">
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
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>Generation</DefinitionTerm>
          <DefinitionDetail variant="value">
            {item.postGenerationId ?? 'Not linked'}
          </DefinitionDetail>
        </div>
      </DefinitionList>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/10 pt-4">
        {item.sourceWorkflowId && (
          <Button
            asChild
            className="inline-flex rounded-lg border border-white/10 bg-muted/30 px-3 py-2 text-sm text-foreground/75 transition-colors hover:border-white/20 hover:bg-muted/60"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          >
            <NextLink
              href={
                item.sourceActionId
                  ? `/orchestration/${item.sourceWorkflowId}?opportunity=${item.sourceActionId}`
                  : `/orchestration/${item.sourceWorkflowId}`
              }
            >
              Open strategy
            </NextLink>
          </Button>
        )}
        {item.postId && (
          <Button
            asChild
            className="inline-flex rounded-lg border border-white/10 bg-muted/30 px-3 py-2 text-sm text-foreground/75 transition-colors hover:border-white/20 hover:bg-muted/60"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          >
            <NextLink href={`/posts/${item.postId}`}>Open draft</NextLink>
          </Button>
        )}
        {item.postUrl && (
          <Button
            asChild
            className="inline-flex rounded-lg border border-white/10 bg-muted/30 px-3 py-2 text-sm text-foreground/75 transition-colors hover:border-white/20 hover:bg-muted/60"
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          >
            <a href={item.postUrl} rel="noreferrer" target="_blank">
              Open published URL
            </a>
          </Button>
        )}
      </div>
    </InsetSurface>
  );
}
