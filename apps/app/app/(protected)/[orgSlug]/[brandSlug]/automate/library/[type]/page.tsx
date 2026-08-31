import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import TwitterReplyBot from '@/features/workflows/components/bots/TwitterReplyBot';
import TwitchChatBot from './TwitchChatBot';
import YoutubeChatBot from './YoutubeChatBot';

export const generateMetadata = createPageMetadata('Agent Library');

interface AutomateLibraryTypeRouteProps {
  params: Promise<{
    type: string;
  }>;
}

const TYPE_COMPONENTS = {
  'twitch-chat': TwitchChatBot,
  'twitter-reply': TwitterReplyBot,
  'youtube-chat': YoutubeChatBot,
} as const;

export default async function AutomateLibraryTypeRoute({
  params,
}: AutomateLibraryTypeRouteProps) {
  const { type } = await params;
  const Component = TYPE_COMPONENTS[type as keyof typeof TYPE_COMPONENTS];

  if (!Component) {
    notFound();
  }

  return (
    <Suspense fallback={<PageLoadingState />}>
      <Component />
    </Suspense>
  );
}
