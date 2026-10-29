'use client';

import type { AgentThread } from '@genfeedai/agent';
import {
  getThreadStatusMeta,
  groupChildThreads,
  resolveThreadListPreview,
} from '@genfeedai/agent/components/agent-thread-list.helpers';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AgentThreadsPanelProps } from '@props/ui/agent-threads-panel.props';
import { Button } from '@ui/primitives/button';
import Searchbar from '@ui/primitives/searchbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import AgentThreadLightView from './AgentThreadLightView';

const ALL_BRANDS = '__all_brands__';

type GroupKey = 'needsYou' | 'working' | 'readyForReview' | 'recent';

const GROUP_ORDER: readonly GroupKey[] = [
  'needsYou',
  'working',
  'readyForReview',
  'recent',
];

/**
 * The Threads tab beside the master conversation: every thread the master (or
 * the operator) started, grouped by what needs attention, with a search box and
 * a brand filter. Picking one opens a light view with a steer box.
 */
export default function AgentThreadsPanel({
  apiService,
  isLoading = false,
  onOpenFullThread,
  threads,
}: AgentThreadsPanelProps) {
  const translate = useTranslations('common.agentThreads');
  const [searchQuery, setSearchQuery] = useState('');
  const [brandId, setBrandId] = useState<string>(ALL_BRANDS);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);

  const brandOptions = useMemo(() => {
    const labels = new Map<string, string>();
    for (const thread of threads) {
      if (thread.brandId && !labels.has(thread.brandId)) {
        labels.set(thread.brandId, thread.brandLabel?.trim() || thread.brandId);
      }
    }
    return [...labels.entries()].map(([id, label]) => ({ id, label }));
  }, [threads]);

  const groups = useMemo(
    () =>
      groupChildThreads([...threads], {
        brandId: brandId === ALL_BRANDS ? null : brandId,
        searchQuery,
      }),
    [brandId, searchQuery, threads],
  );

  const openThread = openThreadId
    ? threads.find((thread) => thread.id === openThreadId)
    : undefined;
  if (openThread) {
    return (
      <AgentThreadLightView
        apiService={apiService}
        onBack={() => setOpenThreadId(null)}
        onOpenFullThread={onOpenFullThread}
        thread={openThread}
      />
    );
  }

  const visibleCount = GROUP_ORDER.reduce(
    (count, key) => count + groups[key].length,
    0,
  );

  const renderRow = (thread: AgentThread) => {
    const status = getThreadStatusMeta(thread);
    const preview = resolveThreadListPreview(thread);
    return (
      <li key={thread.id}>
        <Button
          className="h-auto min-h-10 w-full flex-col items-start gap-0.5 py-2 text-left"
          data-testid={`agent-threads-panel-thread-${thread.id}`}
          onClick={() => setOpenThreadId(thread.id)}
          size={ButtonSize.SM}
          textTransform="none"
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          <span className="flex w-full items-center gap-2">
            <span className="line-clamp-1 flex-1 text-sm font-medium">
              {thread.title?.trim() || translate('untitled')}
            </span>
            {status ? (
              <span className="shrink-0 text-xs text-muted-foreground">
                {status.label}
              </span>
            ) : null}
          </span>
          {preview ? (
            <span className="line-clamp-2 text-xs text-muted-foreground">
              {preview}
            </span>
          ) : null}
          {thread.brandLabel ? (
            <span className="text-xs text-muted-foreground">
              {thread.brandLabel}
            </span>
          ) : null}
        </Button>
      </li>
    );
  };

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="agent-threads-panel"
    >
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Searchbar
          ariaLabel={translate('search')}
          className="min-w-0 flex-1"
          onChange={(event) => setSearchQuery(event.target.value)}
          onClear={() => setSearchQuery('')}
          placeholder={translate('search')}
          value={searchQuery}
        />
        {brandOptions.length > 1 ? (
          <Select onValueChange={setBrandId} value={brandId}>
            <SelectTrigger
              aria-label={translate('brandFilter')}
              className="w-40 shrink-0"
              data-testid="agent-threads-panel-brand-filter"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_BRANDS}>
                {translate('allBrands')}
              </SelectItem>
              {brandOptions.map((brand) => (
                <SelectItem key={brand.id} value={brand.id}>
                  {brand.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {isLoading && visibleCount === 0 ? (
          <p className="text-sm text-muted-foreground" role="status">
            {translate('loading')}
          </p>
        ) : visibleCount === 0 ? (
          <p className="text-sm text-muted-foreground">
            {searchQuery || brandId !== ALL_BRANDS
              ? translate('noMatches')
              : translate('empty')}
          </p>
        ) : (
          GROUP_ORDER.filter((key) => groups[key].length > 0).map((key) => (
            <section
              aria-label={translate(`groups.${key}`)}
              data-testid={`agent-threads-panel-group-${key}`}
              key={key}
            >
              <h3 className="px-2 pb-1 text-xs font-medium uppercase text-muted-foreground">
                {translate(`groups.${key}`)}
              </h3>
              <ul className="space-y-1">{groups[key].map(renderRow)}</ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
