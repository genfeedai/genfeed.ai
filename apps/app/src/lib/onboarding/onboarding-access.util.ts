import type {
  DashboardPreferences,
  ISetting,
  OnboardingAccessMode,
} from '@genfeedai/interfaces';
import { EnvironmentService } from '@services/core/environment.service';

export const ONBOARDING_ACCESS_SOURCE = 'oss-onboarding';

export const ONBOARDING_STORAGE_KEYS = {
  accessMode: 'gf_onboarding_access_mode',
  brandDomain: 'gf_brand_domain',
  brandName: 'gf_brand_name',
  contentType: 'gf_onboarding_content_type',
  previewUrl: 'gf_onboarding_preview_url',
  selectedCredits: 'gf_selected_credits',
  selectedPlan: 'gf_selected_plan',
  source: 'gf_onboarding_source',
} as const;

type OnboardingHandoffStorage = Pick<Storage, 'setItem'>;

export function normalizeOnboardingAccessMode(
  value: unknown,
): OnboardingAccessMode | null {
  if (value === 'server' || value === 'byok' || value === 'cloud') {
    return value;
  }

  return null;
}

function readTrimmedParam(params: URLSearchParams, key: string): string | null {
  const value = params.get(key)?.trim();
  return value || null;
}

function parsePositiveInteger(value?: string | null): string | null {
  const normalizedValue = value?.trim();

  if (!normalizedValue || !/^\d+$/.test(normalizedValue)) {
    return null;
  }

  const parsed = Number.parseInt(normalizedValue, 10);
  return parsed > 0 ? String(parsed) : null;
}

export function getSelectedOnboardingAccessMode(
  settings?: Pick<ISetting, 'dashboardPreferences'> | null,
): OnboardingAccessMode | null {
  return normalizeOnboardingAccessMode(
    settings?.dashboardPreferences?.onboarding?.accessMode,
  );
}

export function extractBrandDomain(value?: string | null): string | null {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return null;
  }

  try {
    const parsed = new URL(
      normalizedValue.includes('://')
        ? normalizedValue
        : `https://${normalizedValue}`,
    );
    return parsed.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    const fallback = normalizedValue
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      ?.replace(/^www\./i, '')
      .toLowerCase();

    return fallback || null;
  }
}

export function deriveBrandNameFromDomain(domain: string): string {
  return domain
    .replace(/\.[a-z]{2,}$/i, '')
    .split(/[.\-_]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
    .trim();
}

export function buildOnboardingAccessSettingsPatch(input: {
  accessMode: OnboardingAccessMode;
  currentSettings?: Pick<ISetting, 'dashboardPreferences'> | null;
  selectedAt?: string;
  source?: string;
}): Pick<ISetting, 'dashboardPreferences'> {
  const currentDashboardPreferences =
    input.currentSettings?.dashboardPreferences ?? ({} as DashboardPreferences);

  return {
    dashboardPreferences: {
      ...currentDashboardPreferences,
      onboarding: {
        ...currentDashboardPreferences.onboarding,
        accessMode: input.accessMode,
        selectedAt: input.selectedAt ?? new Date().toISOString(),
        source:
          input.source ??
          currentDashboardPreferences.onboarding?.source ??
          ONBOARDING_ACCESS_SOURCE,
      },
      scopes: currentDashboardPreferences.scopes ?? {},
    },
  };
}

export function buildGenfeedCloudSignupUrl(input?: {
  accessMode?: OnboardingAccessMode;
  brandDomain?: string | null;
  brandName?: string | null;
  source?: string | null;
}): string {
  const url = new URL('/sign-up', EnvironmentService.apps.app);
  const brandDomain = extractBrandDomain(input?.brandDomain);
  const brandName = input?.brandName?.trim();
  const accessMode =
    normalizeOnboardingAccessMode(input?.accessMode) ?? 'cloud';
  const source = input?.source?.trim() || ONBOARDING_ACCESS_SOURCE;

  url.searchParams.set('accessMode', accessMode);
  url.searchParams.set('source', source);

  if (brandName) {
    url.searchParams.set('brandName', brandName);
  }

  if (brandDomain) {
    url.searchParams.set('brandDomain', brandDomain);
  }

  return url.toString();
}

export function persistOnboardingHandoffParams(
  search: string | URLSearchParams,
  storage: OnboardingHandoffStorage = localStorage,
): void {
  const params =
    typeof search === 'string' ? new URLSearchParams(search) : search;
  const selectedPlan = readTrimmedParam(params, 'plan');
  const selectedCredits = parsePositiveInteger(params.get('credits'));
  const brandDomain = extractBrandDomain(params.get('brandDomain'));
  const brandName = readTrimmedParam(params, 'brandName');
  const accessMode = normalizeOnboardingAccessMode(params.get('accessMode'));
  const source = readTrimmedParam(params, 'source');

  if (selectedPlan) {
    storage.setItem(ONBOARDING_STORAGE_KEYS.selectedPlan, selectedPlan);
  }

  if (selectedCredits) {
    storage.setItem(ONBOARDING_STORAGE_KEYS.selectedCredits, selectedCredits);
  }

  if (brandDomain) {
    storage.setItem(ONBOARDING_STORAGE_KEYS.brandDomain, brandDomain);
  }

  if (brandName) {
    storage.setItem(ONBOARDING_STORAGE_KEYS.brandName, brandName);
  }

  if (accessMode) {
    storage.setItem(ONBOARDING_STORAGE_KEYS.accessMode, accessMode);
  }

  if (source) {
    storage.setItem(ONBOARDING_STORAGE_KEYS.source, source);
  }
}
