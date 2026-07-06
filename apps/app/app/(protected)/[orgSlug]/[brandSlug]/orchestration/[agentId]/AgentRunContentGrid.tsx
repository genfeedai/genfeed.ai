'use client';

import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import type {
  IAgentRunContent,
  IAgentRunContentItem,
} from '@genfeedai/interfaces';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import type { AgentRunContentGridProps } from '@props/automation/agent-strategy.props';
import { AgentRunsService } from '@services/ai/agent-runs.service';
import { logger } from '@services/core/logger.service';
import Badge from '@ui/display/badge/Badge';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { HiOutlineDocumentText, HiOutlinePhoto } from 'react-icons/hi2';

const STATUS_VARIANTS: Record<
  string,
  'success' | 'warning' | 'error' | 'secondary'
> = {
  approved: 'success',
  draft: 'secondary',
  generated: 'success',
  pending: 'warning',
  processing: 'warning',
  published: 'success',
  rejected: 'error',
  review: 'warning',
  scheduled: 'warning',
};

export default function AgentRunContentGrid({
  runId,
}: AgentRunContentGridProps) {
  const { getToken } = useAuthIdentity();
  const [content, setContent] = useState<IAgentRunContent | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchContent = useCallback(
    async (signal: AbortSignal) => {
      try {
        setIsLoading(true);
        const token = await resolveAuthToken(getToken);
        if (!token) return;

        const service = AgentRunsService.getInstance(token);
        const data = await service.getRunContent(runId, signal);
        setContent(data);
      } catch (error: unknown) {
        if ((error as Error).name === 'AbortError') return;
        logger.error('Failed to fetch run content', { error, runId });
      } finally {
        setIsLoading(false);
      }
    },
    [getToken, runId],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchContent(controller.signal);

    return () => {
      controller.abort();
    };
  }, [fetchContent]);

  const allItems: IAgentRunContentItem[] = content
    ? [
        ...content.posts.map((p) => ({ ...p, type: 'post' as const })),
        ...content.ingredients.map((i) => ({
          ...i,
          type: 'ingredient' as const,
        })),
      ]
    : [];

  return isLoading ? (
    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
      {[
        'run-content-skeleton-1',
        'run-content-skeleton-2',
        'run-content-skeleton-3',
        'run-content-skeleton-4',
      ].map((skeletonId) => (
        <div
          key={skeletonId}
          className="h-32 animate-pulse rounded border border-foreground/10 bg-foreground/5"
        />
      ))}
    </div>
  ) : !content ? (
    <div className="p-4 text-center text-sm text-foreground/40">
      Failed to load content.
    </div>
  ) : allItems.length === 0 ? (
    <div className="p-4 text-center text-sm text-foreground/40">
      No content produced by this run.
    </div>
  ) : (
    <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
      {allItems.map((item) => (
        <ContentCard key={`${item.type}-${item.id}`} item={item} />
      ))}
    </div>
  );
}

function ContentCard({ item }: { item: IAgentRunContentItem }) {
  const icon =
    item.type === 'post' ? (
      <HiOutlineDocumentText className="size-5" />
    ) : (
      <HiOutlinePhoto className="size-5" />
    );

  return (
    <div className="flex flex-col gap-2 rounded bg-secondary p-3 shadow-border">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs text-foreground/50">
          {icon}
          <span className="capitalize">{item.type}</span>
        </span>
        <Badge variant={STATUS_VARIANTS[item.status] ?? 'secondary'}>
          {item.status}
        </Badge>
      </div>

      {item.cdnUrl && (
        <div className="aspect-square w-full overflow-hidden rounded bg-foreground/5">
          <Image
            src={item.cdnUrl}
            alt={item.label ?? 'Content'}
            className="size-full object-cover"
            height={320}
            loading="lazy"
            unoptimized
            width={320}
          />
        </div>
      )}

      {item.label && (
        <p className="truncate text-xs font-medium">{item.label}</p>
      )}

      {item.category && (
        <p className="text-[10px] uppercase tracking-wide text-foreground/40">
          {item.category}
        </p>
      )}
    </div>
  );
}
