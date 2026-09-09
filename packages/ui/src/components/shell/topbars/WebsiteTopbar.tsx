'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import TopbarPublic from '@ui/topbars/public/TopbarPublic';
import {
  Bot,
  Building2,
  ChartColumn,
  Cpu,
  HeartHandshake,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
} from 'lucide-react';

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
    href: '/cloud',
    icon: Users,
    label: 'Teams',
  },
  {
    description: 'Agents that create and publish on a schedule',
    href: '/hire-agents',
    icon: Bot,
    label: 'Hire Agents',
  },
  {
    description: 'We run the content system for you',
    href: '/done-for-you',
    icon: HeartHandshake,
    label: 'Done For You',
  },
  {
    description: 'Training and content consultancy',
    href: '/services',
    icon: Building2,
    label: 'Services',
  },
];

/** Who it is for. A plain list — the audience pages carry their own pitch. */
const USE_CASE_LINKS = [
  { href: '/use-cases/creators', label: 'Creators' },
  { href: '/use-cases/agencies', label: 'Agencies' },
  { href: '/use-cases/marketers', label: 'Marketers' },
  { href: '/use-cases/ecommerce', label: 'E-Commerce' },
  { href: '/use-cases/founders', label: 'Founders' },
  { href: '/use-cases/ai-influencers', label: 'AI Influencers' },
  { href: '/use-cases', label: 'All Use Cases' },
];

const NAV_LINKS = [{ href: '/pricing', label: 'Pricing' }];

export default function WebsiteTopbar() {
  const { isSignedIn } = useAuthIdentity();

  return (
    <TopbarPublic
      dropdowns={[
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
        { items: SOLUTIONS_LINKS, label: 'Solutions' },
        { items: USE_CASE_LINKS, label: 'Use Cases' },
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
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                variant={ButtonVariant.SECONDARY}
                className="hidden h-9 px-5 text-sm uppercase xl:inline-flex"
                trackingData={{ action: 'book_demo_topbar' }}
                trackingName="topbar_cta_click"
              >
                <a
                  href={EnvironmentService.calendly}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Book a Demo
                </a>
              </ButtonTracked>
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                className="h-9 px-5 text-sm uppercase"
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
              className="hidden text-xs font-bold uppercase tracking-[0.1em] text-surface/60 transition-colors hover:text-surface lg:block"
            >
              App
            </a>
          )}
        </div>
      }
    />
  );
}
