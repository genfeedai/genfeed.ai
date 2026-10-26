'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useDeferredIsSignedIn } from '@genfeedai/hooks/auth/use-deferred-is-signed-in/use-deferred-is-signed-in';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import ConnectAgentButton from '@ui/buttons/connect-agent/ConnectAgentButton';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import TopbarPublic from '@ui/topbars/public/TopbarPublic';
import {
  HERO_CTA_PENDING_CLASS,
  useHeroCtaRevealed,
} from '@ui/topbars/public/useHeroCtaRevealed';
import {
  Bot,
  Building2,
  ChartColumn,
  Clapperboard,
  Compass,
  Cpu,
  Film,
  HeartHandshake,
  Library,
  Megaphone,
  MessageSquare,
  MonitorDown,
  Rocket,
  Scissors,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Terminal,
  UserRound,
  Users,
  Video,
  Workflow,
  Zap,
} from 'lucide-react';

/**
 * Who it is for. First in the bar: the question people arrive with is whether
 * this is built for someone like them, and they leave if nothing answers it.
 */
const USE_CASE_LINKS = [
  {
    description: 'Ship more without the edit backlog',
    group: 'Solo',
    href: '/use-cases/creators',
    icon: Clapperboard,
    label: 'Creators',
  },
  {
    description: 'Grow an audience while you build',
    group: 'Solo',
    href: '/use-cases/founders',
    icon: Rocket,
    label: 'Founders',
  },
  {
    description: 'Personas that post and engage on their own',
    group: 'Solo',
    href: '/use-cases/ai-influencers',
    icon: UserRound,
    label: 'AI Influencers',
  },
  {
    description: 'Client workspaces, approvals, and bulk output',
    group: 'Teams',
    href: '/use-cases/agencies',
    icon: Building2,
    label: 'Agencies',
  },
  {
    description: 'Test messages fast, track what converts',
    group: 'Teams',
    href: '/use-cases/marketers',
    icon: Megaphone,
    label: 'Marketers',
  },
  {
    description: 'Product content for every channel',
    group: 'Commerce',
    href: '/use-cases/ecommerce',
    icon: ShoppingBag,
    label: 'E-Commerce',
  },
];

/**
 * What the platform is: one entry per app surface, in the order the app's rail
 * and Plugins page group them. Every surface has a page at /products/<slug>.
 */
const PRODUCT_LINKS = [
  {
    description: 'Generate images, video, audio and text',
    group: 'Create',
    href: '/products/playground',
    icon: Sparkles,
    label: 'Playground',
  },
  {
    description: 'Plan a story scene by scene, then generate it',
    group: 'Create',
    href: '/products/storyboard',
    icon: Clapperboard,
    label: 'Storyboard',
  },
  {
    description: 'Turn long videos into short clips',
    group: 'Create',
    href: '/products/clipper',
    icon: Scissors,
    label: 'Clipper',
  },
  {
    description: 'Animated titles, captions and graphics',
    group: 'Create',
    href: '/products/motion',
    icon: Film,
    label: 'Motion',
  },
  {
    description: 'Create content in bulk from one brief',
    group: 'Create',
    href: '/products/turbo',
    icon: Zap,
    label: 'Turbo',
  },
  {
    description: 'Assemble and finish video on a timeline',
    group: 'Create',
    href: '/products/editor',
    icon: Video,
    label: 'Editor',
  },
  {
    description: 'Review, schedule, and publish everywhere',
    group: 'Publish & grow',
    href: '/products/publishing',
    icon: Send,
    label: 'Publishing',
  },
  {
    description: 'Review views and engagement',
    group: 'Publish & grow',
    href: '/products/analytics',
    icon: ChartColumn,
    label: 'Analytics',
  },
  {
    description: 'Find trends and content opportunities',
    group: 'Publish & grow',
    href: '/products/discovery',
    icon: Compass,
    label: 'Discovery',
  },
  {
    description: 'Read and reply in one inbox',
    group: 'Publish & grow',
    href: '/products/messages',
    icon: MessageSquare,
    label: 'Messages',
  },
  {
    description: 'Ask for the work. The agent does it',
    group: 'Operate',
    href: '/products/agent',
    icon: Bot,
    label: 'Agent',
  },
  {
    description: 'Run workflows and recurring tasks',
    group: 'Operate',
    href: '/products/automation',
    icon: Workflow,
    label: 'Automation',
  },
  {
    description: 'Every asset, saved once and reusable',
    group: 'Operate',
    href: '/products/library',
    icon: Library,
    label: 'Library',
  },
  {
    description: 'Browse the live generation catalog',
    group: 'Operate',
    href: '/models',
    icon: Cpu,
    label: 'Models',
  },
  {
    description: 'A native app with a local workspace',
    group: 'Operate',
    href: '/desktop',
    icon: MonitorDown,
    label: 'Desktop',
  },
  {
    description: 'Approvals, assets, integrations, and audit',
    group: 'Operate',
    href: '/features',
    icon: ShieldCheck,
    label: 'Control Plane',
  },
  {
    description: 'Connect agents and MCP clients',
    group: 'Operate',
    href: '/mcp',
    icon: Terminal,
    label: 'MCP Server',
  },
];

/**
 * How you buy it. Complementary to Product rather than a second copy of it:
 * these are the delivery shapes, from a shared workspace to us running it.
 */
const SOLUTIONS_LINKS = [
  {
    description: 'A shared studio with roles and approvals',
    group: 'Self-serve',
    href: '/cloud',
    icon: Users,
    label: 'Teams',
  },
  {
    description: 'Agents that create and publish on a schedule',
    group: 'Automated',
    href: '/hire-agents',
    icon: Bot,
    label: 'Hire Agents',
  },
  {
    description: 'We run the content system for you',
    group: 'Managed',
    href: '/done-for-you',
    icon: HeartHandshake,
    label: 'Done For You',
  },
];

const NAV_LINKS = [
  { href: '/pricing', label: 'Pricing' },
  { href: '/articles', label: 'Blog' },
];

export default function WebsiteTopbar() {
  const isSignedIn = useDeferredIsSignedIn();
  const isHeroCtaRevealed = useHeroCtaRevealed();

  // The desktop bar hides Log in and the agent action to fit, so on a phone they
  // live in the menu. Without them a returning visitor had no way to sign in.
  const mobileActions = isSignedIn ? (
    <ButtonTracked
      asChild
      size={ButtonSize.PUBLIC}
      className="h-12 w-full text-sm uppercase"
      trackingData={{ action: 'open_app_mobile_menu' }}
      trackingName="topbar_cta_click"
    >
      <a href={EnvironmentService.apps.app}>Open Genfeed</a>
    </ButtonTracked>
  ) : (
    // Stacked, not side by side: the agent label is too wide for half a phone row.
    <div className="flex flex-col gap-3">
      <ConnectAgentButton
        label="Connect your agent"
        variant={ButtonVariant.SECONDARY}
        className="h-12 w-full whitespace-nowrap text-sm uppercase"
        trackingAction="connect_agent_mobile_menu"
        trackingName="topbar_cta_click"
      />
      <ButtonTracked
        asChild
        size={ButtonSize.PUBLIC}
        variant={ButtonVariant.SECONDARY}
        className="h-12 w-full whitespace-nowrap text-sm uppercase"
        trackingData={{ action: 'log_in_mobile_menu' }}
        trackingName="topbar_cta_click"
      >
        <a href={`${EnvironmentService.apps.app}/login`}>Log in</a>
      </ButtonTracked>
    </div>
  );

  return (
    <TopbarPublic
      mobileActions={mobileActions}
      dropdowns={[
        {
          footer: {
            description: 'Every audience runs the same system, its own way.',
            href: '/use-cases',
            label: 'Browse all use cases',
          },
          items: USE_CASE_LINKS,
          label: 'Use Cases',
        },
        {
          footer: {
            description:
              'One content system from first brief to verified result.',
            href: '/products',
            label: 'Browse all products',
          },
          items: PRODUCT_LINKS,
          label: 'Product',
        },
        {
          footer: {
            description: 'Every path runs on the same platform and pricing.',
            href: '/pricing',
            label: 'Compare plans',
          },
          items: SOLUTIONS_LINKS,
          label: 'Solutions',
        },
      ]}
      navLinks={NAV_LINKS}
      rightContent={
        <div className="flex items-center gap-3 lg:gap-6">
          {!isSignedIn ? (
            <>
              <a
                href={`${EnvironmentService.apps.app}/login`}
                className="hidden text-xs font-bold uppercase tracking-[0.1em] text-surface/60 transition-colors hover:text-surface lg:block"
              >
                Log in
              </a>
              <div
                data-testid="topbar-actions"
                className={cn(
                  'flex items-center gap-3 transition-[opacity,visibility] duration-200 lg:gap-6',
                  !isHeroCtaRevealed && HERO_CTA_PENDING_CLASS,
                )}
              >
                <ConnectAgentButton
                  label="Connect your agent"
                  variant={ButtonVariant.SECONDARY}
                  className="hidden h-9 px-5 text-sm uppercase xl:inline-flex"
                  trackingAction="connect_agent_topbar"
                  trackingName="topbar_cta_click"
                />
                <ButtonTracked
                  asChild
                  size={ButtonSize.PUBLIC}
                  className="h-11 px-5 text-sm uppercase lg:h-9"
                  trackingData={{ action: 'start_free_topbar' }}
                  trackingName="topbar_cta_click"
                >
                  <a href={`${EnvironmentService.apps.app}/sign-up`}>
                    Start creating
                  </a>
                </ButtonTracked>
              </div>
            </>
          ) : (
            <a
              href={EnvironmentService.apps.app}
              className="text-xs font-bold uppercase tracking-[0.1em] text-surface/60 transition-colors hover:text-surface"
            >
              App
            </a>
          )}
        </div>
      }
    />
  );
}
