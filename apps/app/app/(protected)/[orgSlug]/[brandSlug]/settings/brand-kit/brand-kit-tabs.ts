import { APP_ROUTES } from '@genfeedai/contracts/constants';

/** Brand Kit sections that have a path of their own; Overview is the base path. */
export const BRAND_KIT_TAB_PATHS = {
  strategy: APP_ROUTES.SETTINGS.BRAND_KIT_STRATEGY,
  visual: APP_ROUTES.SETTINGS.BRAND_KIT_VISUAL,
  voice: APP_ROUTES.SETTINGS.BRAND_KIT_VOICE,
} as const;

export type BrandKitPathTab = keyof typeof BRAND_KIT_TAB_PATHS;

export function isBrandKitPathTab(value: string): value is BrandKitPathTab {
  return Object.hasOwn(BRAND_KIT_TAB_PATHS, value);
}
