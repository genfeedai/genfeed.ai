'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import TopbarPublic from '@ui/topbars/public/TopbarPublic';
import {
  ChartColumn,
  Cpu,
  Send,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react';

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

const NAV_LINKS = [
  { href: '/pricing', label: 'Pricing' },
  { href: 'https://docs.genfeed.ai', label: 'Docs' },
];

export default function WebsiteTopbar() {
  const { isSignedIn } = useAuthIdentity();

  return (
    <TopbarPublic
      dropdowns={[{ items: PRODUCT_LINKS, label: 'Product' }]}
      megaMenu
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
