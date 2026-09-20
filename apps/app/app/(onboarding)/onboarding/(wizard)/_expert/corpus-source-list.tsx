'use client';

import KnowledgeStateBadge from '@app/(protected)/[orgSlug]/[brandSlug]/settings/knowledge/knowledge-state-badge';
import {
  ButtonSize,
  ButtonVariant,
  KnowledgeProcessingState,
} from '@genfeedai/contracts';
import type { CorpusSourceListProps } from '@props/onboarding/expert-path.props';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';

export default function CorpusSourceList({
  retryingSourceId,
  sources,
  onRetry,
}: CorpusSourceListProps) {
  const translate = useTranslations('pages.onboarding.expert.corpus');

  if (sources.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{translate('empty')}</p>
    );
  }

  const readyCount = sources.filter(
    (source) =>
      source.version?.processingState === KnowledgeProcessingState.READY,
  ).length;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {translate('readyCount', { ready: readyCount, total: sources.length })}
      </p>
      <ul className="divide-y divide-border border border-border">
        {sources.map((source) => (
          <li
            key={source.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <span className="min-w-0 truncate text-sm text-foreground">
              {source.title}
            </span>
            <span className="flex items-center gap-3">
              <KnowledgeStateBadge version={source.version} />
              {source.version?.processingState ===
              KnowledgeProcessingState.FAILED ? (
                <Button
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.SM}
                  label={translate('retry')}
                  isLoading={retryingSourceId === source.id}
                  onClick={() => onRetry(source.id)}
                  className="rounded-none"
                />
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
