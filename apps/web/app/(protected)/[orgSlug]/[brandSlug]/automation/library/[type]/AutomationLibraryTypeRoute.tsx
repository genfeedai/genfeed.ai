'use client';

import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import WorkspaceContentSkeleton from '@/components/shell/workspace-frame-skeleton/WorkspaceContentSkeleton';
import TwitterReplyBot from '@/features/workflows/components/bots/TwitterReplyBot';
import { readRouteParam } from '@/lib/route-params';
import TwitchChatBot from './TwitchChatBot';
import YoutubeChatBot from './YoutubeChatBot';

const TYPE_COMPONENTS = {
  'twitch-chat': TwitchChatBot,
  'twitter-reply': TwitterReplyBot,
  'youtube-chat': YoutubeChatBot,
} as const;

/**
 * Reads the agent type on the client, so the page is part of the prerendered
 * route shell and a click on it paints at once instead of waiting for a
 * server render. Before the type is known the shell shows the page-body
 * placeholder; an unknown type is a 404.
 */
export default function AutomationLibraryTypeRoute() {
  const params = useRouteParams<{ type?: string | string[] }>();
  const type = readRouteParam(params.type);

  if (!type) {
    return <WorkspaceContentSkeleton />;
  }

  if (!Object.hasOwn(TYPE_COMPONENTS, type)) {
    notFound();
  }

  const Component = TYPE_COMPONENTS[type as keyof typeof TYPE_COMPONENTS];

  return (
    <Suspense fallback={null}>
      <Component />
    </Suspense>
  );
}
