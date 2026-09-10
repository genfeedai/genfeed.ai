'use client';

import { KnowledgeProcessingState } from '@genfeedai/contracts';
import type { KnowledgeStateBadgeProps } from '@props/content/knowledge-library.props';
import { Badge } from '@ui/primitives/badge';
import { useTranslations } from 'next-intl';

const LABEL_KEY_BY_STATE: Record<KnowledgeProcessingState, string> = {
  [KnowledgeProcessingState.FAILED]: 'failed',
  [KnowledgeProcessingState.PROCESSING]: 'processing',
  [KnowledgeProcessingState.QUEUED]: 'queued',
  [KnowledgeProcessingState.READY]: 'ready',
};

const VARIANT_BY_STATE: Record<
  KnowledgeProcessingState,
  'destructive' | 'info' | 'success' | 'warning'
> = {
  [KnowledgeProcessingState.FAILED]: 'destructive',
  [KnowledgeProcessingState.PROCESSING]: 'info',
  [KnowledgeProcessingState.QUEUED]: 'warning',
  [KnowledgeProcessingState.READY]: 'success',
};

export default function KnowledgeStateBadge({
  version,
}: KnowledgeStateBadgeProps) {
  const translate = useTranslations('pages.library.knowledge.state');
  if (!version) {
    return <Badge variant="outline">{translate('none')}</Badge>;
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Badge variant={VARIANT_BY_STATE[version.processingState]}>
        {translate(LABEL_KEY_BY_STATE[version.processingState])}
      </Badge>
      {version.processingState === KnowledgeProcessingState.FAILED &&
      version.processingError ? (
        <span className="text-xs text-destructive">
          {version.processingError}
        </span>
      ) : null}
    </span>
  );
}
