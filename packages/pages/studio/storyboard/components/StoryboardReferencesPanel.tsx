'use client';

import { AgentMediaArtifactPreview } from '@genfeedai/agent/components/AgentMediaArtifactPreview';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { StoryboardReferencesPanelProps } from '@genfeedai/props/studio/storyboard.props';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Layers, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** Only references selected for this storyboard, never fabricated media. */
export default function StoryboardReferencesPanel({
  references,
  actions,
}: StoryboardReferencesPanelProps) {
  const translate = useTranslations('pages.studioStoryboard.workspace');
  const [search, setSearch] = useState('');
  const matching = references.filter((reference) =>
    `${reference.title} ${reference.group}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <aside
      aria-label={translate('references')}
      className="min-w-0 space-y-4 rounded-lg border border-border p-4 lg:sticky lg:top-4 lg:self-start"
      data-testid="storyboard-references"
    >
      <div className="flex items-center gap-2">
        <Layers className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="flex-1 text-sm font-medium">
          {translate('references')}
        </h2>
        <span className="text-xs text-muted-foreground">
          {references.length}
        </span>
      </div>
      <Input
        aria-label={translate('searchReferences')}
        placeholder={translate('searchReferences')}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      <div className="max-h-96 space-y-3 overflow-y-auto">
        {matching.map((reference) => (
          <div
            key={reference.id}
            className="space-y-2 border-b border-border pb-3 last:border-0"
          >
            {reference.url ? (
              <AgentMediaArtifactPreview
                displayMode="featured"
                assets={[
                  {
                    kind: reference.kind,
                    url: reference.url,
                    title: reference.title,
                    alt: reference.title,
                  },
                ]}
              />
            ) : null}
            <div className="flex items-center gap-2">
              {reference.onSelect ? (
                <Button
                  label={reference.title}
                  variant={ButtonVariant.GHOST}
                  aria-pressed={reference.isSelected}
                  className={cn(
                    'min-w-0 flex-1 justify-start',
                    reference.isSelected && 'bg-hover',
                  )}
                  onClick={reference.onSelect}
                />
              ) : (
                <p className="min-w-0 flex-1 truncate text-sm">
                  {reference.title}
                </p>
              )}
              {reference.onRemove ? (
                <Button
                  ariaLabel={translate('removeReference', {
                    title: reference.title,
                  })}
                  icon={<X className="size-3" />}
                  size={ButtonSize.ICON}
                  variant={ButtonVariant.GHOST}
                  onClick={reference.onRemove}
                />
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">{reference.group}</p>
          </div>
        ))}
        {!matching.length ? (
          <p className="text-xs text-muted-foreground">
            {translate(search.trim() ? 'noMatchingReferences' : 'noReferences')}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
