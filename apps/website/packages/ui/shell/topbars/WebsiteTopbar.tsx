'use client';

import { UserButton, useAuth } from '@clerk/nextjs';
import { ButtonSize } from '@genfeedai/enums';
import { EnvironmentService } from '@services/core/environment.service';
import { Button } from '@ui/primitives/button';
import TopbarPublic from '@ui/topbars/public/TopbarPublic';
import {
  HiBuildingOffice2,
  HiChartBar,
  HiGlobeAlt,
  HiMegaphone,
  HiShare,
  HiShoppingCart,
  HiSparkles,
  HiStar,
  HiUserCircle,
} from 'react-icons/hi2';

const PRODUCT_LINKS = [
  {
    description: 'Generate AI videos, images, avatars',
    href: '/#studio',
    icon: HiSparkles,
    label: 'Studio',
  },
  {
    description: 'Schedule & post everywhere',
    href: '/#publish',
    icon: HiShare,
    label: 'Publish',
  },
  {
    description: 'Trends, analytics, ROI tracking',
    href: '/#intelligence',
    icon: HiChartBar,
    label: 'Intelligence',
  },
  {
    description: 'Connect every platform',
    href: '/integrations',
    icon: HiGlobeAlt,
    label: 'Integrations',
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
    description: 'Campaign content on autopilot',
    href: '/use-cases/marketers',
    icon: HiMegaphone,
    label: 'Marketers',
  },
];

const NAV_LINKS = [{ href: '/pricing', label: 'Pricing' }];

export default function WebsiteTopbar() {
  const { isSignedIn } = useAuth();

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
                className="h-9 px-5 text-sm uppercase"
              >
                <a
                  href={`${EnvironmentService.apps.app}/sign-up`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Get Started
                </a>
              </Button>
            </>
          ) : (
            <>
              <a
                href={EnvironmentService.apps.app}
                className="hidden text-xs font-bold uppercase tracking-[0.1em] text-surface/60 transition-colors hover:text-surface lg:block"
              >
                App
              </a>
              <UserButton />
            </>
          )}
        </div>
      }
    />
  );
}
