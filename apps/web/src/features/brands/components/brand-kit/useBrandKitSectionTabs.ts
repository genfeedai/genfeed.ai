'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { BrandKitSectionTabs } from '@/features/brands/props/brand-kit-workspace.props';

/** One Brand Kit, five sibling sections. Content rules keeps its own path. */
export const BRAND_KIT_SECTION_PATHS = {
  overview: APP_ROUTES.SETTINGS.BRAND_KIT,
  rules: '/settings/brand-kit/content-rules',
  strategy: APP_ROUTES.SETTINGS.BRAND_KIT_STRATEGY,
  visual: APP_ROUTES.SETTINGS.BRAND_KIT_VISUAL,
  voice: APP_ROUTES.SETTINGS.BRAND_KIT_VOICE,
} as const;

type BrandKitSectionId = keyof typeof BRAND_KIT_SECTION_PATHS;

function isBrandKitSectionId(value: string): value is BrandKitSectionId {
  return Object.hasOwn(BRAND_KIT_SECTION_PATHS, value);
}

/**
 * The subbar tabs every Brand Kit page shares, so Overview, Visual, Voice,
 * Strategy and Content rules switch with one control instead of each page
 * (or a "..." menu) owning its own navigation.
 */
export function useBrandKitSectionTabs(
  activeTab: string,
): BrandKitSectionTabs {
  const t = useTranslations('pages.brandKitSettings');
  const router = useRouter();
  const { href } = useOrgUrl();
  return {
    activeTab,
    ariaLabel: t('sectionsLabel'),
    fullWidth: false,
    onTabChange: (next) => {
      if (!isBrandKitSectionId(next)) return;
      router.push(href(BRAND_KIT_SECTION_PATHS[next]), { scroll: false });
    },
    tabs: [
      { id: 'overview', label: t('overview') },
      { id: 'visual', label: t('visual') },
      { id: 'voice', label: t('voice') },
      { id: 'strategy', label: t('strategy') },
      { id: 'rules', label: t('rules') },
    ],
  };
}
