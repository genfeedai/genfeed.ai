'use client';

import { ContextSidebarPanel } from '@contexts/ui/context-sidebar-context';
import type { GenerationDetailPanelProps } from '@props/admin/generations.props';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import GenerationStatusBadge from './generation-status-badge';
import GenerationThumbnail from './generation-thumbnail';

/** Past this many characters a prompt starts collapsed: branded runs prepend pages of harness text. */
const COLLAPSED_PROMPT_LENGTH = 600;

function PromptSection({
  label,
  text,
  showLabel,
  hideLabel,
}: {
  label: string;
  text: string;
  showLabel: string;
  hideLabel: string;
}) {
  const isLong = text.length > COLLAPSED_PROMPT_LENGTH;
  const [isOpen, setIsOpen] = useState(!isLong);
  if (!text) return null;

  return (
    <Collapsible
      className="flex flex-col gap-1.5"
      onOpenChange={setIsOpen}
      open={isOpen}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </h3>
        {isLong ? (
          <CollapsibleTrigger className="cursor-pointer text-xs font-medium text-primary underline-offset-2 hover:underline">
            {isOpen ? hideLabel : showLabel}
          </CollapsibleTrigger>
        ) : null}
      </div>
      <CollapsibleContent>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-tertiary p-3 font-mono text-xs leading-relaxed">
          {text}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** A generation's prompts, harness and outcome in the right context sidebar. */
export default function GenerationDetailPanel({
  generation,
  onClose,
}: GenerationDetailPanelProps) {
  const t = useTranslations('pages.adminGenerations');

  if (!generation) {
    return (
      <ContextSidebarPanel onClose={onClose} selection={null}>
        {null}
      </ContextSidebarPanel>
    );
  }

  const subtitle = [
    generation.userLabel,
    generation.organizationLabel,
    generation.model,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ContextSidebarPanel
      onClose={onClose}
      selection={{
        id: `${generation.kind}-${generation.id}`,
        kind: 'generation',
        origin: 'user',
        subtitle: subtitle || undefined,
        title: t('detailTitle'),
      }}
    >
      <div
        className="flex flex-col gap-5 p-4"
        data-testid="generation-detail-panel"
        key={generation.id}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <GenerationStatusBadge status={generation.status} />
          <ClientFormattedDate value={generation.createdAt} />
          {generation.credits !== null ? (
            <span className="tabular-nums">
              {t('credits', { count: generation.credits })}
            </span>
          ) : null}
        </div>

        {generation.error ? (
          <p
            className="rounded-md bg-destructive/15 p-3 text-sm text-destructive"
            role="alert"
          >
            {generation.error}
          </p>
        ) : null}

        <GenerationThumbnail generation={generation} sizes={480} />

        <PromptSection
          hideLabel={t('hide')}
          label={t('original')}
          showLabel={t('show')}
          text={generation.original}
        />
        <PromptSection
          hideLabel={t('hide')}
          label={t('enhanced')}
          showLabel={t('show')}
          text={generation.enhanced}
        />
        <PromptSection
          hideLabel={t('hide')}
          label={t('compiled')}
          showLabel={t('show')}
          text={generation.compiled}
        />
        <PromptSection
          hideLabel={t('hide')}
          label={t('negative')}
          showLabel={t('show')}
          text={generation.negative}
        />

        {generation.directives.length > 0 ? (
          <section className="flex flex-col gap-1.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('directives')}
            </h3>
            <ul className="flex flex-col gap-1 text-sm">
              {generation.directives.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </ContextSidebarPanel>
  );
}
