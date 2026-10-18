'use client';

import type { GenerationDetailSheetProps } from '@props/admin/generations.props';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@ui/primitives/collapsible';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@ui/primitives/sheet';
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

export default function GenerationDetailSheet({
  generation,
  onClose,
}: GenerationDetailSheetProps) {
  const t = useTranslations('pages.adminGenerations');

  return (
    <Sheet
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      open={generation !== null}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {generation ? (
          <div className="flex flex-col gap-5" key={generation.id}>
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">
                {t('detailTitle')}
                <GenerationStatusBadge status={generation.status} />
              </SheetTitle>
              <SheetDescription className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {generation.userLabel ? (
                  <span>{generation.userLabel}</span>
                ) : null}
                {generation.organizationLabel ? (
                  <span>{generation.organizationLabel}</span>
                ) : null}
                {generation.model ? (
                  <span className="font-mono">{generation.model}</span>
                ) : null}
                <ClientFormattedDate value={generation.createdAt} />
                {generation.credits !== null ? (
                  <span className="tabular-nums">
                    {t('credits', { count: generation.credits })}
                  </span>
                ) : null}
              </SheetDescription>
            </SheetHeader>

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
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
