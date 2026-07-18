'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import TopbarPublic from '@ui/topbars/public/TopbarPublic';
import {
  HiChartBar,
  HiCommandLine,
  HiPaperAirplane,
  HiServerStack,
  HiShieldCheck,
} from 'react-icons/hi2';

const PRODUCT_LINKS = [
  {
    description: 'Connect Claude Code, Codex, and other MCP clients',
    href: '/mcp',
    icon: HiCommandLine,
    label: 'MCP Server',
  },
  {
    description: 'Review, schedule, and publish across every channel',
    href: '/publisher',
    icon: HiPaperAirplane,
    label: 'Publishing',
  },
  {
    description: 'Approvals, assets, integrations, and audit in one place',
    href: '/features',
    icon: HiShieldCheck,
    label: 'Control Plane',
  },
  {
    description: 'Track revenue, not vanity metrics',
    href: '/analytics',
    icon: HiChartBar,
    label: 'Analytics',
  },
  {
    description: 'Own the stack, data, keys, and deployment',
    href: '/self-hosted',
    icon: HiServerStack,
    label: 'Self-hosting',
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
      navLinks={NAV_LINKS}
      rightContent={
        <div className="flex items-center gap-6">
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
                variant={ButtonVariant.OUTLINE}
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
                trackingData={{ action: 'connect_mcp_topbar' }}
                trackingName="topbar_cta_click"
              >
                <a
                  href={EnvironmentService.mcpConnectHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Connect MCP
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
