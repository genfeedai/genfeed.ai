import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { filterActionsByRole } from '@genfeedai/agent/utils/filter-actions-by-role';
import type { MemberRole } from '@genfeedai/enums';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import {
  HiOutlineCalendarDays,
  HiOutlineChartBar,
  HiOutlineClipboardDocumentCheck,
  HiOutlineCog6Tooth,
  HiOutlineDocumentText,
  HiOutlineFilm,
  HiOutlineFolderOpen,
  HiOutlineMagnifyingGlass,
  HiOutlinePaintBrush,
  HiOutlinePause,
  HiOutlinePencilSquare,
  HiOutlinePhoto,
  HiOutlineRocketLaunch,
  HiOutlineSparkles,
  HiOutlineTrophy,
  HiOutlineUserGroup,
  HiOutlineWrenchScrewdriver,
} from 'react-icons/hi2';

interface PageContextConfig {
  suggestedActions: SuggestedAction[];
  placeholder: string;
}

const ROUTE_CONTEXT_MAP: Record<string, PageContextConfig> = {
  '/analytics': {
    placeholder: 'Ask about your analytics...',
    suggestedActions: [
      {
        icon: HiOutlineChartBar({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Compare',
        prompt: 'Compare my content performance across platforms',
      },
      {
        icon: HiOutlineTrophy({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Top posts',
        prompt: 'What was my best performing content this month?',
      },
      {
        icon: HiOutlineRocketLaunch({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Growth',
        prompt: 'Give me growth tips based on my analytics data',
      },
    ],
  },
  '/analytics/insights': {
    placeholder: 'Ask about your AI insights...',
    suggestedActions: [
      {
        icon: HiOutlineChartBar({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Summarize',
        prompt:
          'Summarize my AI insights and tell me the highest-priority next step.',
      },
      {
        icon: HiOutlineRocketLaunch({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Repeat',
        prompt:
          'Based on my current insight suggestions, what should I repeat or remix next?',
      },
    ],
  },
  '/analytics/performance-lab': {
    placeholder: 'Ask about winning patterns...',
    suggestedActions: [
      {
        icon: HiOutlineSparkles({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Patterns',
        prompt:
          'Show me the strongest creative patterns and explain how I should reuse them.',
      },
      {
        icon: HiOutlinePencilSquare({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Remix',
        prompt:
          'Take the best-performing pattern here and suggest a fresh remix for my next asset.',
      },
    ],
  },
  '/articles': {
    placeholder: 'Ask about your articles...',
    suggestedActions: [
      {
        icon: HiOutlineDocumentText({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Write',
        prompt: 'Help me write a new long-form article',
      },
      {
        icon: HiOutlinePencilSquare({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Edit',
        prompt: 'Help me edit and polish my latest article draft',
      },
    ],
  },
  '/automation': {
    placeholder: 'Ask about automations...',
    suggestedActions: [
      {
        icon: HiOutlineWrenchScrewdriver({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Create',
        prompt: 'Help me create a new automation workflow',
      },
      {
        icon: HiOutlinePause({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Pause',
        prompt: 'Pause my current running campaigns',
      },
      {
        icon: HiOutlineSparkles({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Status',
        prompt: 'Show me the status of all my automated bots',
      },
    ],
  },
  '/calendar': {
    placeholder: 'Ask about your calendar...',
    suggestedActions: [
      {
        icon: HiOutlineCalendarDays({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Fill gaps',
        prompt:
          'Find gaps in my content schedule and suggest posts to fill them',
      },
      {
        icon: HiOutlineCalendarDays({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Reschedule',
        prompt: 'Help me reorganize my posting schedule for better engagement',
      },
      {
        icon: HiOutlineCalendarDays({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Plan',
        prompt: 'Plan my content schedule for next week',
      },
    ],
  },
  '/chat': {
    placeholder: 'Ask me anything...',
    suggestedActions: [
      {
        icon: HiOutlineCalendarDays({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Generate',
        prompt: 'Generate 20 posts for this week across my connected platforms',
      },
      {
        icon: HiOutlineClipboardDocumentCheck({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Review',
        prompt: 'Show me pending content in the review queue',
      },
      {
        icon: HiOutlineChartBar({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Analytics',
        prompt: 'How did my content perform this week? Show me the analytics',
      },
      {
        icon: HiOutlinePhoto({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Create',
        prompt: 'Generate a professional lifestyle photo for Instagram',
        visibleTo: ['owner', 'admin', 'creator'] as MemberRole[],
      },
      {
        icon: HiOutlineCog6Tooth({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Autopilot',
        prompt: 'Help me set up my proactive agent strategy',
        visibleTo: ['owner', 'admin'] as MemberRole[],
      },
      {
        icon: HiOutlineUserGroup({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Team',
        prompt: 'Help me manage team members and permissions',
        visibleTo: ['owner', 'admin'] as MemberRole[],
      },
    ],
  },
  '/library': {
    placeholder: 'Ask about your library...',
    suggestedActions: [
      {
        icon: HiOutlineMagnifyingGlass({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Search',
        prompt: 'Help me find images in my library for a new post',
      },
      {
        icon: HiOutlinePaintBrush({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Variations',
        prompt: 'Create variations of my recent images',
      },
      {
        icon: HiOutlineFolderOpen({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Organize',
        prompt: 'Help me organize my media library',
      },
    ],
  },
  '/library/images': {
    placeholder: 'Ask about your images...',
    suggestedActions: [
      {
        icon: HiOutlinePhoto({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Generate',
        prompt: 'Generate a professional lifestyle photo for Instagram',
      },
      {
        icon: HiOutlinePaintBrush({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Variations',
        prompt: 'Create variations of my recent images',
      },
      {
        icon: HiOutlineMagnifyingGlass({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Search',
        prompt: 'Help me find images in my library for a new post',
      },
    ],
  },
  '/library/videos': {
    placeholder: 'Ask about your videos...',
    suggestedActions: [
      {
        icon: HiOutlineFilm({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Create',
        prompt: 'Help me create a new video from my images',
      },
      {
        icon: HiOutlineMagnifyingGlass({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Search',
        prompt: 'Help me find videos in my library',
      },
    ],
  },
  '/overview': {
    placeholder: 'What would you like to do?',
    suggestedActions: [
      {
        icon: HiOutlineCalendarDays({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Generate',
        prompt: 'Generate 20 posts for this week across my connected platforms',
      },
      {
        icon: HiOutlineClipboardDocumentCheck({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Review',
        prompt: 'Show me pending content in the review queue',
      },
      {
        icon: HiOutlineChartBar({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Analytics',
        prompt: 'How did my content perform this week? Show me the analytics',
      },
    ],
  },
  '/overview/activities': {
    placeholder: 'Ask about recent activity...',
    suggestedActions: [
      {
        icon: HiOutlineChartBar({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Summary',
        prompt: 'Give me a summary of recent content activity',
      },
      {
        icon: HiOutlineMagnifyingGlass({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Engage',
        prompt: 'Search for posts I should engage with',
      },
    ],
  },
  '/posts': {
    placeholder: 'Ask about your posts...',
    suggestedActions: [
      {
        icon: HiOutlineCalendarDays({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Schedule',
        prompt: 'Help me schedule my pending posts for this week',
      },
      {
        icon: HiOutlinePencilSquare({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Captions',
        prompt: 'Write engaging captions for my latest posts',
      },
      {
        icon: HiOutlineClipboardDocumentCheck({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Review',
        prompt: 'Show me all posts in the review queue',
      },
    ],
  },
  '/posts/': {
    placeholder: 'Ask about this post...',
    suggestedActions: [
      {
        icon: HiOutlineChartBar({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Performance',
        prompt:
          'Review this post and tell me whether I should analyze, remix, or leave it alone.',
      },
      {
        icon: HiOutlinePencilSquare({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Remix',
        prompt:
          'Suggest a remix direction for this post based on what usually performs best.',
      },
    ],
  },
  '/posts/review': {
    placeholder: 'Ask about content review...',
    suggestedActions: [
      {
        icon: HiOutlineClipboardDocumentCheck({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Queue',
        prompt: 'Show me all content waiting for review',
      },
      {
        icon: HiOutlineSparkles({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Approve',
        prompt: 'Review and approve all posts that are ready to publish',
      },
      {
        icon: HiOutlinePencilSquare({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Captions',
        prompt: 'Improve the captions on my pending review posts',
      },
    ],
  },
  '/research': {
    placeholder: 'Ask about trends...',
    suggestedActions: [
      {
        icon: HiOutlineRocketLaunch({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Trending',
        prompt: 'What topics are trending in my niche right now?',
      },
      {
        icon: HiOutlineSparkles({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Ideas',
        prompt: 'Suggest content ideas based on current trends',
      },
    ],
  },
  '/research/ads': {
    placeholder: 'Ask about winning ads in your niche...',
    suggestedActions: [
      {
        icon: HiOutlineSparkles({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Top ads',
        prompt:
          'List the best-performing ads in my niche and explain why they work.',
      },
      {
        icon: HiOutlineChartBar({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Compare',
        prompt:
          'Compare Meta Ads versus Google Ads winners for my current niche.',
      },
      {
        icon: HiOutlineWrenchScrewdriver({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Workflow',
        prompt:
          'Create an ad remix workflow from the strongest winner on this page.',
      },
    ],
  },
  '/research/ads/google': {
    placeholder: 'Ask about Google and YouTube ads...',
    suggestedActions: [
      {
        icon: HiOutlineSparkles({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Google winners',
        prompt:
          'Show me the best Google ads for this niche across Search, Display, and YouTube.',
      },
      {
        icon: HiOutlineRocketLaunch({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Launch prep',
        prompt:
          'Prepare a paused Google campaign draft from the strongest ad on this page.',
      },
    ],
  },
  '/research/ads/meta': {
    placeholder: 'Ask about Meta ad winners...',
    suggestedActions: [
      {
        icon: HiOutlineSparkles({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Meta winners',
        prompt:
          'Show me the best-performing Meta ads for this niche and summarize the reusable angles.',
      },
      {
        icon: HiOutlinePencilSquare({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Remix',
        prompt:
          'Pick one Meta ad here and draft a brand-specific remix ad pack.',
      },
    ],
  },
  '/settings': {
    placeholder: 'Need help with settings?',
    suggestedActions: [
      {
        icon: HiOutlineCog6Tooth({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Configure',
        prompt: 'Help me configure my account settings',
      },
      {
        icon: HiOutlineWrenchScrewdriver({
          className: 'h-5 w-5 text-foreground/50',
        }),
        label: 'Connect',
        prompt: 'Help me connect a new social media account',
      },
    ],
  },
  '/settings/models/trainings': {
    placeholder: 'Ask about your trainings...',
    suggestedActions: [
      {
        icon: HiOutlineSparkles({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Train',
        prompt: 'Help me start a new AI model training',
      },
      {
        icon: HiOutlineChartBar({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Status',
        prompt: 'Show me the status of my model trainings',
      },
    ],
  },
  '/studio': {
    placeholder: 'Ask about this asset...',
    suggestedActions: [
      {
        icon: HiOutlineSparkles({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Next step',
        prompt:
          'Summarize the best next step for the asset I am viewing right now.',
      },
      {
        icon: HiOutlinePaintBrush({ className: 'h-5 w-5 text-foreground/50' }),
        label: 'Variations',
        prompt: 'Suggest variations or remixes I should try for this asset.',
      },
    ],
  },
};

const DEFAULT_CONTEXT: PageContextConfig = {
  placeholder: 'Ask me anything...',
  suggestedActions: [
    {
      icon: HiOutlineCalendarDays({ className: 'h-5 w-5 text-foreground/50' }),
      label: 'Generate',
      prompt: 'Generate 20 posts for this week across my connected platforms',
    },
    {
      icon: HiOutlineClipboardDocumentCheck({
        className: 'h-5 w-5 text-foreground/50',
      }),
      label: 'Review',
      prompt: 'Show me pending content in the review queue',
    },
    {
      icon: HiOutlineChartBar({ className: 'h-5 w-5 text-foreground/50' }),
      label: 'Analytics',
      prompt: 'How did my content perform this week? Show me the analytics',
    },
  ],
};

// Sort route keys by descending length so /library/images matches before /library
const SORTED_ROUTE_KEYS = Object.keys(ROUTE_CONTEXT_MAP).sort(
  (a, b) => b.length - a.length,
);

function getContextForRoute(pathname: string): PageContextConfig {
  // Exact match first
  if (ROUTE_CONTEXT_MAP[pathname]) {
    return ROUTE_CONTEXT_MAP[pathname];
  }
  // Prefix match — longest route first
  for (const route of SORTED_ROUTE_KEYS) {
    if (pathname.startsWith(route)) {
      return ROUTE_CONTEXT_MAP[route];
    }
  }
  return DEFAULT_CONTEXT;
}

/**
 * Reads the current pathname and syncs contextual suggested actions
 * and placeholder text into the agent chat store.
 * Optionally filters actions by user role.
 */
export function useAgentPageContext(role?: MemberRole): PageContextConfig {
  const pathname = usePathname();
  const setPageContext = useAgentChatStore((s) => s.setPageContext);

  const config = useMemo(() => {
    const base = getContextForRoute(pathname);
    return {
      ...base,
      suggestedActions: filterActionsByRole(base.suggestedActions, role),
    };
  }, [pathname, role]);

  useEffect(() => {
    setPageContext({
      placeholder: config.placeholder,
      route: pathname,
      suggestedActions: config.suggestedActions,
    });

    return () => {
      setPageContext(null);
    };
  }, [pathname, config, setPageContext]);

  return config;
}
