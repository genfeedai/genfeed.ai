'use client';

import { KnowledgeProcessingState } from '@genfeedai/contracts';
import type { KnowledgeStateBadgeProps } from '@props/content/knowledge-library.props';
import { Badge } from '@ui/primitives/badge';

const LABEL_BY_STATE: Record<KnowledgeProcessingState, string> = {
  [KnowledgeProcessingState.FAILED]: 'Failed',
  [KnowledgeProcessingState.PROCESSING]: 'Processing',
  [KnowledgeProcessingState.QUEUED]: 'Queued',
  [KnowledgeProcessingState.READY]: 'Ready',
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
  if (!version) {
    return <Badge variant="outline">No capture</Badge>;
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Badge variant={VARIANT_BY_STATE[version.processingState]}>
        {LABEL_BY_STATE[version.processingState]}
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
