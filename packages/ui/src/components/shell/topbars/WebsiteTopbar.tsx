'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useDeferredIsSignedIn } from '@genfeedai/hooks/auth/use-deferred-is-signed-in/use-deferred-is-signed-in';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import ConnectAgentButton from '@ui/buttons/connect-agent/ConnectAgentButton';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import TopbarPublic from '@ui/topbars/public/TopbarPublic';
import {
  Bot,
  Building2,
  ChartColumn,
  Clapperboard,
  Cpu,
  HeartHandshake,
  Megaphone,
  Rocket,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Terminal,
  UserRound,
  Users,
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

/** What the platform is. Grouped, so it renders as the full-width panel. */
const PRODUCT_LINKS = [
  {
    description: 'Generate every format in one workspace',
    group: 'Create',
    href: '/studio',
    icon: Sparkles,
    label: 'Studio',
  },
  {
    description: 'Browse the live generation catalog',
    group: 'Create',
    href: '/models',
    icon: Cpu,
    label: 'Models',
  },
  {
    description: 'Review, schedule, and publish everywhere',
    group: 'Operate',
    href: '/publishing',
    icon: Send,
    label: 'Publishing',
  },
  {
    description: 'Track revenue, not vanity metrics',
    group: 'Operate',
    href: '/analytics',
    icon: ChartColumn,
    label: 'Analytics',
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
    group: 'Build',
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
    <div className="grid grid-cols-2 gap-3">
      <ButtonTracked
        asChild
        size={ButtonSize.PUBLIC}
        variant={ButtonVariant.SECONDARY}
        className="h-12 w-full text-sm uppercase"
        trackingData={{ action: 'log_in_mobile_menu' }}
        trackingName="topbar_cta_click"
      >
        <a href={`${EnvironmentService.apps.app}/login`}>Log in</a>
      </ButtonTracked>
      <ConnectAgentButton
        label="Connect your agent"
        variant={ButtonVariant.SECONDARY}
        className="h-12 w-full text-sm uppercase"
        trackingAction="connect_agent_mobile_menu"
        trackingName="topbar_cta_click"
      />
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
            href: '/features',
            label: 'Explore every capability',
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
