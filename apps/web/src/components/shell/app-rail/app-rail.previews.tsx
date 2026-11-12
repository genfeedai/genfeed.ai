import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';
import type { AppRailPreviewContentProps } from '@/props/ui/app-rail.props';
import { RailPreviewLoading } from './previews/RailPreviewLoading';

type PreviewComponent = ComponentType<AppRailPreviewContentProps>;

// Each preview loads on first hover, so none of them weighs on the pages
// every member opens. The loading skeleton is its own module for the same
// reason: the shared parts pull in lists, cards and images.
const loading = () => <RailPreviewLoading />;

/**
 * The hover preview body of each rail app, by app id. An app with no entry
 * (Admin and its categories) shows its tooltip only.
 */
export const APP_RAIL_PREVIEWS: Readonly<
  Record<string, PreviewComponent | undefined>
> = {
  agent: dynamic(() => import('./previews/AgentRailPreview'), { loading }),
  analytics: dynamic(() => import('./previews/AnalyticsRailPreview'), {
    loading,
  }),
  automation: dynamic(() => import('./previews/AutomationRailPreview'), {
    loading,
  }),
  clipper: dynamic(() => import('./previews/ClipperRailPreview'), { loading }),
  discovery: dynamic(() => import('./previews/DiscoveryRailPreview'), {
    loading,
  }),
  editor: dynamic(() => import('./previews/EditorRailPreview'), { loading }),
  library: dynamic(() => import('./previews/LibraryRailPreview'), { loading }),
  messages: dynamic(() => import('./previews/MessagesRailPreview'), {
    loading,
  }),
  motion: dynamic(() => import('./previews/MotionRailPreview'), { loading }),
  playground: dynamic(() => import('./previews/PlaygroundRailPreview'), {
    loading,
  }),
  publishing: dynamic(() => import('./previews/PublishingRailPreview'), {
    loading,
  }),
  storyboard: dynamic(() => import('./previews/StoryboardRailPreview'), {
    loading,
  }),
  turbo: dynamic(() => import('./previews/TurboRailPreview'), { loading }),
  workspace: dynamic(() => import('./previews/WorkspaceRailPreview'), {
    loading,
  }),
};
