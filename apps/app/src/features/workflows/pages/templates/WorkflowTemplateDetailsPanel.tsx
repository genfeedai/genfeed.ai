'use client';

import { ContextSidebarPanel } from '@contexts/ui/context-sidebar-context';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { WorkflowTemplateDetailsPanelProps } from '@genfeedai/props/workflows/workflow-template-details-panel.props';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import WorkflowTemplateCardPreview from './WorkflowTemplateCardPreview';

/** A template's description, metadata and preview in the right context sidebar. */
export function WorkflowTemplateDetailsPanel({
  actionLabel,
  categoryLabel,
  changeSummary,
  description,
  href,
  id,
  isInstalling = false,
  onClose,
  onInstall,
  preview,
  scheduleLabel,
  sourceLabel,
  title,
}: WorkflowTemplateDetailsPanelProps) {
  const translate = useTranslations('pages.workflows.templates');

  if (id === null) {
    return (
      <ContextSidebarPanel onClose={onClose} selection={null}>
        {null}
      </ContextSidebarPanel>
    );
  }

  return (
    <ContextSidebarPanel
      onClose={onClose}
      selection={{
        id,
        kind: 'template',
        origin: 'user',
        subtitle: categoryLabel || undefined,
        title,
      }}
    >
      <div
        className="flex flex-col gap-4 p-4"
        data-testid="workflow-template-details-panel"
      >
        <p className="text-sm text-foreground/80">{description}</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-muted-foreground">{translate('source')}</dt>
          <dd>{sourceLabel}</dd>
          <dt className="text-muted-foreground">{translate('category')}</dt>
          <dd>{categoryLabel}</dd>
          {scheduleLabel ? (
            <>
              <dt className="text-muted-foreground">{translate('schedule')}</dt>
              <dd>{scheduleLabel}</dd>
            </>
          ) : null}
        </dl>
        {changeSummary ? (
          <p className="text-sm text-foreground/80">{changeSummary}</p>
        ) : null}
        {preview ? (
          <WorkflowTemplateCardPreview
            name={preview.name}
            exampleOutput={preview.exampleOutput}
            nodes={preview.nodes}
            edges={preview.edges}
          />
        ) : null}
        {onInstall ? (
          <Button
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.SM}
            disabled={isInstalling}
            onClick={onInstall}
          >
            {isInstalling ? 'Installing…' : actionLabel}
          </Button>
        ) : href ? (
          <Button
            asChild
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.SM}
            withWrapper={false}
          >
            <Link href={href}>{actionLabel}</Link>
          </Button>
        ) : null}
      </div>
    </ContextSidebarPanel>
  );
}
