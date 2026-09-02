import type { SuggestedAction } from '@genfeedai/agent/models/agent-suggested-action.model';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { resolveBrandSurfaceSuggestions } from '@genfeedai/agent/utils/agent-surface-suggestions.util';
import { filterActionsByRole } from '@genfeedai/agent/utils/filter-actions-by-role';
import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import type { MemberRole } from '@genfeedai/contracts';
import { APP_ROUTE_PREFIXES, APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  Calendar,
  ChartColumn,
  ClipboardCheck,
  FileText,
  Film,
  FolderOpen,
  Image,
  Paintbrush,
  Pause,
  Rocket,
  Search,
  Settings,
  Sparkles,
  SquarePen,
  Trophy,
  Users,
  Wrench,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { createElement, useEffect, useMemo } from 'react';

interface PageContextConfig {
  suggestedActions: SuggestedAction[];
  placeholder: string;
}

const ROUTE_CONTEXT_MAP: Record<string, PageContextConfig> = {
  [APP_ROUTES.ANALYTICS.ROOT]: {
    placeholder: 'Ask about your analytics...',
    suggestedActions: [
      {
        icon: createElement(ChartColumn, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Compare',
        prompt: 'Compare my content performance across platforms',
      },
      {
        icon: createElement(Trophy, { className: 'size-5 text-foreground/50' }),
        label: 'Top posts',
        prompt: 'What was my best performing content this month?',
      },
      {
        icon: createElement(Rocket, { className: 'size-5 text-foreground/50' }),
        label: 'Growth',
        prompt: 'Give me growth tips based on my analytics data',
      },
    ],
  },
  [APP_ROUTES.ANALYTICS.INSIGHTS]: {
    placeholder: 'Ask about your AI insights...',
    suggestedActions: [
      {
        icon: createElement(ChartColumn, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Summarize',
        prompt:
          'Summarize my AI insights and tell me the highest-priority next step.',
      },
      {
        icon: createElement(Rocket, { className: 'size-5 text-foreground/50' }),
        label: 'Repeat',
        prompt:
          'Based on my current insight suggestions, what should I repeat or remix next?',
      },
    ],
  },
  [APP_ROUTES.ANALYTICS.PERFORMANCE_LAB]: {
    placeholder: 'Ask about winning patterns...',
    suggestedActions: [
      {
        icon: createElement(Sparkles, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Patterns',
        prompt:
          'Show me the strongest creative patterns and explain how I should reuse them.',
      },
      {
        icon: createElement(SquarePen, {
          className: 'size-5 text-foreground/50',
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
        icon: createElement(FileText, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Write',
        prompt: 'Help me write a new long-form article',
      },
      {
        icon: createElement(SquarePen, {
          className: 'size-5 text-foreground/50',
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
        icon: createElement(Wrench, { className: 'size-5 text-foreground/50' }),
        label: 'Create',
        prompt: 'Help me create a new automation workflow',
      },
      {
        icon: createElement(Pause, { className: 'size-5 text-foreground/50' }),
        label: 'Pause',
        prompt: 'Pause my current running programs',
      },
      {
        icon: createElement(Sparkles, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Status',
        prompt: 'Show me the status of all my automated bots',
      },
    ],
  },
  '/calendar': {
    placeholder: 'Ask about your calendar...',
    suggestedActions: [
      {
        icon: createElement(Calendar, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Fill gaps',
        prompt:
          'Find gaps in my content schedule and suggest posts to fill them',
      },
      {
        icon: createElement(Calendar, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Reschedule',
        prompt: 'Help me reorganize my posting schedule for better engagement',
      },
      {
        icon: createElement(Calendar, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Plan',
        prompt: 'Plan my content schedule for next week',
      },
    ],
  },
  [APP_ROUTES.AGENT.ROOT]: {
    placeholder: 'Ask me anything...',
    suggestedActions: [
      {
        icon: createElement(Calendar, { className: 'size-5 text-info' }),
        label: 'Generate posts for this week',
        prompt: 'Generate 20 posts for this week across my connected platforms',
      },
      {
        icon: createElement(ClipboardCheck, {
          className: 'size-5 text-primary',
        }),
        label: 'Review pending content',
        prompt: "Show me what's waiting for review",
      },
      {
        icon: createElement(ChartColumn, {
          className: 'size-5 text-success',
        }),
        label: "Check this week's analytics",
        prompt: 'How did my content perform this week? Show me the analytics',
      },
      {
        icon: createElement(Image, { className: 'size-5 text-foreground/50' }),
        label: 'Create',
        prompt: 'Generate a professional lifestyle photo for Instagram',
        visibleTo: ['owner', 'admin', 'creator'] as MemberRole[],
      },
      {
        icon: createElement(Film, { className: 'size-5 text-foreground/50' }),
        label: 'Video',
        prompt: 'Help me plan and generate a short brand video.',
        visibleTo: ['owner', 'admin', 'creator'] as MemberRole[],
      },
      {
        icon: createElement(Settings, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Autopilot',
        prompt: 'Help me set up my proactive agent strategy',
        visibleTo: ['owner', 'admin'] as MemberRole[],
      },
      {
        icon: createElement(Users, { className: 'size-5 text-foreground/50' }),
        label: 'Team',
        prompt: 'Help me manage team members and permissions',
        visibleTo: ['owner', 'admin'] as MemberRole[],
      },
    ],
  },
  [APP_ROUTES.EDIT.ROOT]: {
    placeholder: 'Ask the co-pilot to improve this draft...',
    suggestedActions: [
      {
        icon: createElement(SquarePen, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Improve',
        prompt: 'Review the current draft and suggest concrete improvements.',
      },
      {
        icon: createElement(Sparkles, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Rewrite',
        prompt: 'Rewrite this draft in a sharper brand voice.',
      },
      {
        icon: createElement(ClipboardCheck, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Ready?',
        prompt: 'Check whether this draft is ready to publish.',
      },
    ],
  },
  [APP_ROUTE_PREFIXES.LIBRARY]: {
    placeholder: 'Ask about your library...',
    suggestedActions: [
      {
        icon: createElement(Search, { className: 'size-5 text-foreground/50' }),
        label: 'Search',
        prompt: 'Help me find images in my library for a new post',
      },
      {
        icon: createElement(Paintbrush, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Variations',
        prompt: 'Create variations of my recent images',
      },
      {
        icon: createElement(FolderOpen, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Organize',
        prompt: 'Help me organize my media library',
      },
    ],
  },
  [APP_ROUTES.LIBRARY.IMAGES]: {
    placeholder: 'Ask about your images...',
    suggestedActions: [
      {
        icon: createElement(Image, { className: 'size-5 text-foreground/50' }),
        label: 'Generate',
        prompt: 'Generate a professional lifestyle photo for Instagram',
      },
      {
        icon: createElement(Paintbrush, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Variations',
        prompt: 'Create variations of my recent images',
      },
      {
        icon: createElement(Search, { className: 'size-5 text-foreground/50' }),
        label: 'Search',
        prompt: 'Help me find images in my library for a new post',
      },
    ],
  },
  [APP_ROUTES.LIBRARY.VIDEOS]: {
    placeholder: 'Ask about your videos...',
    suggestedActions: [
      {
        icon: createElement(Film, { className: 'size-5 text-foreground/50' }),
        label: 'Create',
        prompt: 'Help me create a new video from my images',
      },
      {
        icon: createElement(Search, { className: 'size-5 text-foreground/50' }),
        label: 'Search',
        prompt: 'Help me find videos in my library',
      },
    ],
  },
  [APP_ROUTES.OVERVIEW.ROOT]: {
    placeholder: 'What would you like to do?',
    suggestedActions: [
      {
        icon: createElement(Calendar, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Generate',
        prompt: 'Generate 20 posts for this week across my connected platforms',
      },
      {
        icon: createElement(ClipboardCheck, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Review',
        prompt: "Show me what's waiting for review",
      },
      {
        icon: createElement(ChartColumn, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Analytics',
        prompt: 'How did my content perform this week? Show me the analytics',
      },
    ],
  },
  [APP_ROUTES.OVERVIEW.ACTIVITIES]: {
    placeholder: 'Ask about recent activity...',
    suggestedActions: [
      {
        icon: createElement(ChartColumn, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Summary',
        prompt: 'Give me a summary of recent content activity',
      },
      {
        icon: createElement(Search, { className: 'size-5 text-foreground/50' }),
        label: 'Engage',
        prompt: 'Search for posts I should engage with',
      },
    ],
  },
  [APP_ROUTES.WORKSPACE.ROOT]: {
    placeholder: 'What would you like to do?',
    suggestedActions: [
      {
        icon: createElement(Calendar, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Generate',
        prompt: 'Generate 20 posts for this week across my connected platforms',
      },
      {
        icon: createElement(ClipboardCheck, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Review',
        prompt: "Show me what's waiting for review",
      },
      {
        icon: createElement(ChartColumn, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Analytics',
        prompt: 'How did my content perform this week? Show me the analytics',
      },
    ],
  },
  [APP_ROUTES.WORKSPACE.ACTIVITY]: {
    placeholder: 'Ask about recent activity...',
    suggestedActions: [
      {
        icon: createElement(ChartColumn, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Summary',
        prompt: 'Give me a summary of recent content activity',
      },
      {
        icon: createElement(Search, { className: 'size-5 text-foreground/50' }),
        label: 'Engage',
        prompt: 'Search for posts I should engage with',
      },
    ],
  },
  [APP_ROUTES.PUBLISHING.ROOT]: {
    placeholder: 'Ask about your posts...',
    suggestedActions: [
      {
        icon: createElement(Calendar, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Schedule',
        prompt: 'Help me schedule my pending posts for this week',
      },
      {
        icon: createElement(SquarePen, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Captions',
        prompt: 'Write engaging captions for my latest posts',
      },
      {
        icon: createElement(ClipboardCheck, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Review',
        prompt: 'Show me all posts in the review queue',
      },
    ],
  },
  [`${APP_ROUTES.PUBLISHING.ROOT}/`]: {
    placeholder: 'Ask about this post...',
    suggestedActions: [
      {
        icon: createElement(ChartColumn, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Performance',
        prompt:
          'Review this post and tell me whether I should analyze, remix, or leave it alone.',
      },
      {
        icon: createElement(SquarePen, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Remix',
        prompt:
          'Suggest a remix direction for this post based on what usually performs best.',
      },
    ],
  },
  [APP_ROUTES.PUBLISHING.REVIEW]: {
    placeholder: 'Ask about content review...',
    suggestedActions: [
      {
        icon: createElement(ClipboardCheck, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Queue',
        prompt: 'Show me all content waiting for review',
      },
      {
        icon: createElement(Sparkles, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Approve',
        prompt: 'Review and approve all posts that are ready to publish',
      },
      {
        icon: createElement(SquarePen, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Captions',
        prompt: 'Improve the captions on my pending review posts',
      },
    ],
  },
  [APP_ROUTES.DISCOVERY.ROOT]: {
    placeholder: 'Ask about trends...',
    suggestedActions: [
      {
        icon: createElement(Rocket, { className: 'size-5 text-foreground/50' }),
        label: 'Trending',
        prompt: 'What topics are trending in my niche right now?',
      },
      {
        icon: createElement(Sparkles, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Ideas',
        prompt: 'Suggest content ideas based on current trends',
      },
    ],
  },
  [APP_ROUTES.DISCOVERY.ADS]: {
    placeholder: 'Ask about winning ads in your niche...',
    suggestedActions: [
      {
        icon: createElement(Sparkles, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Top ads',
        prompt:
          'List the best-performing ads in my niche and explain why they work.',
      },
      {
        icon: createElement(ChartColumn, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Compare',
        prompt:
          'Compare Meta Ads versus Google Ads winners for my current niche.',
      },
      {
        icon: createElement(Wrench, { className: 'size-5 text-foreground/50' }),
        label: 'Workflow',
        prompt:
          'Create an ad remix workflow from the strongest winner on this page.',
      },
    ],
  },
  [APP_ROUTES.SETTINGS.ROOT]: {
    placeholder: 'Need help with settings?',
    suggestedActions: [
      {
        icon: createElement(Settings, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Configure',
        prompt: 'Help me configure my account settings',
      },
      {
        icon: createElement(Wrench, { className: 'size-5 text-foreground/50' }),
        label: 'Connect',
        prompt: 'Help me connect a new social media account',
      },
    ],
  },
  [APP_ROUTES.SETTINGS.MODEL_TRAININGS]: {
    placeholder: 'Ask about your trainings...',
    suggestedActions: [
      {
        icon: createElement(Sparkles, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Train',
        prompt: 'Help me start a new AI model training',
      },
      {
        icon: createElement(ChartColumn, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Status',
        prompt: 'Show me the status of my model trainings',
      },
    ],
  },
  [APP_ROUTES.STUDIO.ROOT]: {
    placeholder: 'Ask about this asset...',
    suggestedActions: [
      {
        icon: createElement(Sparkles, {
          className: 'size-5 text-foreground/50',
        }),
        label: 'Next step',
        prompt:
          'Summarize the best next step for the asset I am viewing right now.',
      },
      {
        icon: createElement(Paintbrush, {
          className: 'size-5 text-foreground/50',
        }),
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
      icon: createElement(Calendar, { className: 'size-5 text-info' }),
      label: 'Generate posts for this week',
      prompt: 'Generate 20 posts for this week across my connected platforms',
    },
    {
      icon: createElement(ClipboardCheck, {
        className: 'size-5 text-primary',
      }),
      label: 'Review pending content',
      prompt: "Show me what's waiting for review",
    },
    {
      icon: createElement(ChartColumn, {
        className: 'size-5 text-success',
      }),
      label: "Check this week's analytics",
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

function normalizeAgentContextPathname(rawPathname: string): string {
  const parts = rawPathname.split('/').filter(Boolean);

  if (parts.length >= 3) {
    return parts[1] === '~'
      ? `/${parts.slice(2).join('/')}`
      : `/${parts.slice(2).join('/')}`;
  }

  return rawPathname;
}

/**
 * Reads the current pathname and syncs contextual suggested actions
 * and placeholder text into the agent chat store.
 * Optionally filters actions by user role.
 */
export function useAgentPageContext(role?: MemberRole): PageContextConfig {
  const pathname = usePathname();
  const { selectedBrand } = useBrand();
  const setPageContext = useAgentChatStore((s) => s.setPageContext);
  const contextPathname = useMemo(
    () => normalizeAgentContextPathname(pathname),
    [pathname],
  );

  const config = useMemo(() => {
    const base = getContextForRoute(contextPathname);
    const personalized = resolveBrandSurfaceSuggestions(
      contextPathname,
      selectedBrand?.agentConfig,
    ).map((suggestion) => ({
      icon:
        suggestion.intent === 'create'
          ? createElement(Sparkles, { className: 'size-5 text-foreground/50' })
          : suggestion.intent === 'plan'
            ? createElement(Calendar, {
                className: 'size-5 text-foreground/50',
              })
            : createElement(ChartColumn, {
                className: 'size-5 text-foreground/50',
              }),
      label: suggestion.label,
      prompt: suggestion.prompt,
    }));
    return {
      ...base,
      suggestedActions:
        personalized.length > 0
          ? personalized
          : filterActionsByRole(base.suggestedActions, role).slice(0, 3),
    };
  }, [contextPathname, role, selectedBrand?.agentConfig]);

  useEffect(() => {
    const currentContext = useAgentChatStore.getState().pageContext;
    if (currentContext?.route === pathname && currentContext.draftType) {
      return;
    }

    setPageContext({
      ...(currentContext?.route === pathname ? currentContext : {}),
      placeholder: config.placeholder,
      route: pathname,
      suggestedActions: config.suggestedActions,
    });

    return () => {
      const latestContext = useAgentChatStore.getState().pageContext;
      if (latestContext?.route === pathname) {
        setPageContext(null);
      }
    };
  }, [pathname, config, setPageContext]);

  return config;
}
