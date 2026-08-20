'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionTerm,
} from '@genfeedai/ui';
import { getPublisherPostHref } from '@helpers/content/posts.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import NextLink from 'next/link';

import type { ReviewPanelItem } from './review-panel.types';

interface ReviewLineagePanelProps {
  item: ReviewPanelItem;
}

export default function ReviewLineagePanel({ item }: ReviewLineagePanelProps) {
  const { href } = useOrgUrl();

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
            href={href(
              `${APP_ROUTES.AUTOMATE.AGENTS}/${item.sourceWorkflowId}${
                item.sourceActionId ? `?opportunity=${item.sourceActionId}` : ''
              }`,
            )}
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
          <NextLink href={href(getPublisherPostHref(item.postId))}>
            Open draft
          </NextLink>
        </Button>
      ) : null}
    </div>
  );
}
