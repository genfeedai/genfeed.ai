'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import {
  DefinitionDetail,
  DefinitionList,
  DefinitionTerm,
} from '@genfeedai/ui';
import { getPublishingPostHref } from '@helpers/content/posts.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { Button } from '@ui/primitives/button';
import NextLink from 'next/link';
import { useTranslations } from 'next-intl';

import type { ReviewPanelItem } from './review-panel.types';

interface ReviewLineagePanelProps {
  item: ReviewPanelItem;
}

export default function ReviewLineagePanel({ item }: ReviewLineagePanelProps) {
  const { href } = useOrgUrl();
  const translate = useTranslations('pages.publishing.review.lineage');
  const notRecorded = translate('notRecorded');

  return (
    <div className="space-y-3 border-b border-border px-4 py-4 last:border-b-0">
      <h3 className="text-sm font-medium text-foreground">
        {translate('title')}
      </h3>
      <DefinitionList className="text-sm">
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>{translate('run')}</DefinitionTerm>
          <DefinitionDetail variant="value">
            {item.contentRunId ?? notRecorded}
          </DefinitionDetail>
        </div>
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>{translate('recipe')}</DefinitionTerm>
          <DefinitionDetail variant="value">
            {item.creativeVersion ?? notRecorded}
          </DefinitionDetail>
        </div>
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>{translate('variant')}</DefinitionTerm>
          <DefinitionDetail variant="value">
            {item.variantId ?? notRecorded}
          </DefinitionDetail>
        </div>
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>{translate('ingredient')}</DefinitionTerm>
          <DefinitionDetail variant="value">
            {item.ingredientId ?? translate('copyOnlyOutput')}
          </DefinitionDetail>
        </div>
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>{translate('post')}</DefinitionTerm>
          <DefinitionDetail variant="value">
            {item.postId ?? notRecorded}
          </DefinitionDetail>
        </div>
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>{translate('topic')}</DefinitionTerm>
          <DefinitionDetail variant="value">
            {item.opportunityTopic ?? notRecorded}
          </DefinitionDetail>
        </div>
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>{translate('sourceType')}</DefinitionTerm>
          <DefinitionDetail variant="value" className="capitalize">
            {item.opportunitySourceType ?? notRecorded}
          </DefinitionDetail>
        </div>
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>{translate('workflow')}</DefinitionTerm>
          <DefinitionDetail variant="value">
            {item.sourceWorkflowName ?? item.sourceWorkflowId ?? notRecorded}
          </DefinitionDetail>
        </div>
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>{translate('workflowRun')}</DefinitionTerm>
          <DefinitionDetail variant="value">
            {item.workflowExecutionId ?? notRecorded}
          </DefinitionDetail>
        </div>
        <div className="flex items-start justify-between gap-4">
          <DefinitionTerm>{translate('action')}</DefinitionTerm>
          <DefinitionDetail variant="value">
            {item.sourceActionId ?? notRecorded}
          </DefinitionDetail>
        </div>
      </DefinitionList>

      {item.workflowExecutionId ? (
        <Button
          asChild
          className="h-8 px-0 text-xs"
          variant={ButtonVariant.LINK}
          withWrapper={false}
        >
          <NextLink
            href={href(
              `${APP_ROUTES.AUTOMATION.WORKFLOWS_EXECUTIONS}/${item.workflowExecutionId}`,
            )}
          >
            {translate('openWorkflowRun')}
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
          <NextLink href={href(getPublishingPostHref(item.postId))}>
            {translate('openDraft')}
          </NextLink>
        </Button>
      ) : null}
    </div>
  );
}
