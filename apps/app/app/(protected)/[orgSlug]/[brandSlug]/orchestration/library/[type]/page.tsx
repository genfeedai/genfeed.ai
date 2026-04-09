import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import TwitterReplyBot from '@/features/workflows/components/bots/TwitterReplyBot';
import TwitchChatBot from './TwitchChatBot';
import YoutubeChatBot from './YoutubeChatBot';

export const generateMetadata = createPageMetadata('Agent Library');

interface OrchestrationLibraryTypeRouteProps {
  params: Promise<{
    type: string;
  }>;
}

const TYPE_COMPONENTS = {
  'twitch-chat': TwitchChatBot,
  'twitter-reply': TwitterReplyBot,
  'youtube-chat': YoutubeChatBot,
} as const;

export default async function OrchestrationLibraryTypeRoute({
  params,
}: OrchestrationLibraryTypeRouteProps) {
  const { type } = await params;
  const Component = TYPE_COMPONENTS[type as keyof typeof TYPE_COMPONENTS];

  if (!Component) {
    notFound();
  }

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <Component />
    </Suspense>
  );
}
