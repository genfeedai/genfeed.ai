'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { type AgentThread, useAgentChatStore } from '@genfeedai/agent';
import {
  getThreadStatusMeta,
  groupChildThreads,
  resolveThreadListPreview,
} from '@genfeedai/agent/components/agent-thread-list.helpers';
import { AgentThreadStatus } from '@genfeedai/contracts';
import type { ThreadListStatus } from '@genfeedai/props/ui/lists/thread-list.props';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { ThreadListSubtitle } from '@ui/lists/thread-list/ThreadList';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { buildAgentThreadHref } from '@/lib/navigation/operator-shell';
import type { AppRailPreviewContentProps } from '@/props/ui/app-rail.props';
import type { AppRailPreviewItem } from '@/props/ui/app-rail-preview.props';
import {
  RailPreviewItems,
  RailPreviewSection,
  RailPreviewState,
} from './rail-preview-parts';

const SECTION_LIMIT = 3;

function describeStatus(thread: AgentThread): ThreadListStatus {
  if (thread.status === AgentThreadStatus.ARCHIVED) return 'resolved';
  const meta = getThreadStatusMeta(thread);
  if (meta?.tone === 'warning') return 'attention';
  if (meta?.tone === 'running') return 'running';
  if (meta?.tone === 'failed') return 'failed';
  return thread.runStatus === 'completed' ? 'done' : 'idle';
}

/** Agent: the threads that need the member, what is running, what is recent. */
export default function AgentRailPreview(_props: AppRailPreviewContentProps) {
  const translate = useTranslations('common.appRail.preview.agent');
  const untitled = useTranslations('common.agentThreads')('untitled');
  const { brandId } = useBrand();
  const { orgHref } = useOrgUrl();
  const threads = useAgentChatStore((state) => state.threads);
  const groups = useMemo(
    () =>
      groupChildThreads([...threads], {
        brandId: brandId || null,
        searchQuery: '',
      }),
    [brandId, threads],
  );
  const toItem = (thread: AgentThread): AppRailPreviewItem => ({
    href: orgHref(buildAgentThreadHref(thread.id)),
    id: thread.id,
    isoDate: thread.lastActivityAt ?? thread.updatedAt,
    status: describeStatus(thread),
    subtitle: <ThreadListSubtitle parts={[resolveThreadListPreview(thread)]} />,
    title: thread.title?.trim() || untitled,
  });
  const sections = [
    { items: groups.needsYou, key: 'needsYou' },
    { items: groups.working, key: 'working' },
    { items: groups.readyForReview, key: 'readyForReview' },
    { items: groups.recent, key: 'recent' },
  ] as const;
  // Needs-you first; "recent" only fills a row when nothing else is open.
  const isEmpty = sections.every((section) => section.items.length === 0);

  return (
    <RailPreviewState
      emptyLabel={translate('empty')}
      isEmpty={isEmpty}
      isError={false}
      isLoading={false}
    >
      {sections
        .filter((section) => section.items.length > 0)
        .map((section) => (
          <RailPreviewSection
            count={String(section.items.length)}
            key={section.key}
            title={translate(`groups.${section.key}`)}
          >
            <RailPreviewItems
              items={section.items.slice(0, SECTION_LIMIT).map(toItem)}
            />
          </RailPreviewSection>
        ))}
    </RailPreviewState>
  );
}
