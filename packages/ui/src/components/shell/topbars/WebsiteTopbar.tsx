'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import { Button } from '@ui/primitives/button';
import TopbarPublic from '@ui/topbars/public/TopbarPublic';
import {
  HiArrowPath,
  HiBuildingOffice2,
  HiChartBar,
  HiMagnifyingGlass,
  HiMegaphone,
  HiPaperAirplane,
  HiRectangleStack,
  HiShoppingCart,
  HiSparkles,
  HiSquares2X2,
  HiStar,
  HiUserCircle,
  HiUserGroup,
} from 'react-icons/hi2';

const PRODUCT_LINKS = [
  {
    description: 'Generate every format in one workspace',
    group: 'Create',
    href: '/studio',
    icon: HiSparkles,
    label: 'Studio',
  },
  {
    description: 'Every asset your team reuses',
    group: 'Create',
    href: '/library',
    icon: HiRectangleStack,
    label: 'Library',
  },
  {
    description: "Find what's working now",
    group: 'Create',
    href: '/research',
    icon: HiMagnifyingGlass,
    label: 'Research',
  },
  {
    description: 'Prompt packs and creative recipes',
    group: 'Create',
    href: '/skills',
    icon: HiSquares2X2,
    label: 'Skills',
  },
  {
    description: 'Plan, schedule, and publish everywhere',
    group: 'Operate',
    href: '/publisher',
    icon: HiPaperAirplane,
    label: 'Publisher',
  },
  {
    description: 'Automate your content pipeline',
    group: 'Operate',
    href: '/workflows',
    icon: HiArrowPath,
    label: 'Workflows',
  },
  {
    description: 'Track revenue, not vanity metrics',
    group: 'Operate',
    href: '/analytics',
    icon: HiChartBar,
    label: 'Analytics',
  },
  {
    description: 'Your autonomous content team',
    group: 'Operate',
    href: '/agents',
    icon: HiUserGroup,
    label: 'Agents',
  },
];

const USE_CASES_LINKS = [
  {
    description: 'Virtual influencers that post 24/7',
    href: '/use-cases/ai-influencers',
    icon: HiStar,
    label: 'AI Influencers',
  },
  {
    description: '10x output, track what converts',
    href: '/use-cases/creators',
    icon: HiUserCircle,
    label: 'Content Creators',
  },
  {
    description: 'Scale client content, white-label',
    href: '/use-cases/agencies',
    icon: HiBuildingOffice2,
    label: 'Agencies',
  },
  {
    description: 'Product content at scale',
    href: '/use-cases/ecommerce',
    icon: HiShoppingCart,
    label: 'E-commerce',
  },
  {
    description: 'Campaign content and reporting',
    href: '/use-cases/marketers',
    icon: HiMegaphone,
    label: 'Marketers',
  },
];

const NAV_LINKS = [{ href: '/pricing', label: 'Pricing' }];

export default function WebsiteTopbar() {
  const { isSignedIn } = useAuthIdentity();
  const signUpHref = `${EnvironmentService.apps.app}/sign-up?plan=payg`;

  return (
    <TopbarPublic
      dropdowns={[
        { items: PRODUCT_LINKS, label: 'Product' },
        { items: USE_CASES_LINKS, label: 'Use Cases' },
      ]}
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
              <Button
                asChild
                size={ButtonSize.PUBLIC}
                variant={ButtonVariant.OUTLINE}
                className="hidden h-9 px-5 text-sm uppercase xl:inline-flex"
              >
                <a
                  href={EnvironmentService.calendly}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Book Demo
                </a>
              </Button>
              <Button
                asChild
                size={ButtonSize.PUBLIC}
                className="h-9 px-5 text-sm uppercase"
              >
                <a href={signUpHref} target="_blank" rel="noopener noreferrer">
                  Create now
                </a>
              </Button>
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
