'use client';

import { useOnboarding } from '@contexts/onboarding/onboarding-context';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { isDesktopClient } from '@genfeedai/config/deployment';
import { LinkCategory, type OrganizationCategory } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IBrandAgentConfig } from '@genfeedai/contracts/interfaces';
import { resolveSignupBrandDomain } from '@genfeedai/helpers';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useGsapTimeline } from '@hooks/ui/use-gsap-entrance';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { UsersService } from '@services/organization/users.service';
import { BrandsService } from '@services/social/brands.service';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  deriveBrandNameFromDomain,
  extractBrandDomain,
  ONBOARDING_STORAGE_KEYS,
  parseOnboardingAccountType,
} from '@/lib/onboarding/onboarding-access.util';
import BrandAccountTypeSelector from './brand-account-type-selector';
import BrandFormFields from './brand-form-fields';
import {
  extractBrandScrapeErrorCode,
  resolveBrandScrapeIssueCode,
} from './brand-scrape-issue.util';
import BrandStepHeader from './brand-step-header';

const DEFAULT_ORGANIZATION_LABEL = 'Default Organization';

const TIMELINE_STEPS = [
  {
    duration: 0.8,
    from: { opacity: 0, y: 20 },
    selector: '.step-badge',
  },
  {
    duration: 1,
    from: { opacity: 0, y: 30 },
    offset: '-=0.4',
    selector: '.step-headline',
  },
  {
    duration: 0.8,
    from: { opacity: 0, y: 20 },
    offset: '-=0.5',
    selector: '.step-description',
  },
  {
    duration: 0.6,
    from: { opacity: 0, y: 30 },
    offset: '-=0.3',
    selector: '.step-form',
  },
  {
    duration: 0.6,
    from: { opacity: 0, y: 15 },
    offset: '-=0.3',
    selector: '.step-actions',
  },
];

function normalizeWebsiteUrl(url: string): string | null {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return null;
  }

  return trimmedUrl.includes('://') ? trimmedUrl : `https://${trimmedUrl}`;
}

function isPlaceholderName(value?: string | null): boolean {
  return !value?.trim() || value.trim() === DEFAULT_ORGANIZATION_LABEL;
}

function buildBrandGuidance(input: {
  brandName: string;
  organizationName: string;
  targetAudience?: string;
  tone?: string;
}): string {
  const parts = [
    `Brand: ${input.brandName}.`,
    `Organization: ${input.organizationName}.`,
  ];

  if (input.targetAudience) {
    parts.push(`Audience: ${input.targetAudience}.`);
  }

  if (input.tone) {
    parts.push(`Tone: ${input.tone}.`);
  }

  return parts.join('\n');
}

function BrandContentContent() {
  const sectionRef = useGsapTimeline<HTMLDivElement>({ steps: TIMELINE_STEPS });
  const { getToken } = useAuthIdentity();
  const { push } = useRouter();
  const { handleStepComplete, setAccountType: setOnboardingAccountType } =
    useOnboarding();
  const translate = useTranslations('pages.onboarding.brand');
  const searchParams = useSearchParams();
  const { currentUser } = useCurrentUser();
  const [step, setStep] = useState(1);
  const [prefillReady, setPrefillReady] = useState(false);
  const initialBrandName =
    localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandName) ?? '';
  const initialWebsiteUrl =
    localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandDomain) ?? '';

  const [brandName, setBrandName] = useState(
    () =>
      initialBrandName ||
      deriveBrandNameFromDomain(extractBrandDomain(initialWebsiteUrl) ?? ''),
  );
  const [websiteUrl, setWebsiteUrl] = useState(() => initialWebsiteUrl);
  const [targetAudience, setTargetAudience] = useState('');
  const [tone, setTone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [accountType, setAccountType] = useState<OrganizationCategory | null>(
    null,
  );
  const nameEditedRef = useRef(!!initialBrandName);
  const websiteEditedRef = useRef(false);
  const accountTypeEditedRef = useRef(false);
  // Resource ids resolved during prefill; the collapsed onboarding routes are
  // now resource PATCH/POST on /brands and /organizations (REST audit #1354).
  const brandIdRef = useRef<string | null>(null);
  const orgIdRef = useRef<string | null>(null);

  // Prefill form fields from existing brand/organization data
  useEffect(() => {
    const controller = new AbortController();

    const prefill = async () => {
      try {
        const token = await resolveAuthToken(getToken);
        if (!token || controller.signal.aborted) {
          return;
        }

        const service = UsersService.getInstance(token);

        if (controller.signal.aborted) {
          return;
        }

        const [brands, organizations] = await Promise.all([
          // Only the first brand is read below, so one row is enough.
          service.findMeBrands({ limit: 1 }),
          service.findMeOrganizations(),
        ]);

        if (controller.signal.aborted) {
          return;
        }

        const brand = brands[0];
        const org = organizations[0];

        if (brand?.id) {
          brandIdRef.current = brand.id;
        }
        if (org?.id) {
          orgIdRef.current = org.id;
        }

        if (!nameEditedRef.current) {
          const label = !isPlaceholderName(brand?.label)
            ? brand?.label
            : org?.label;
          if (!isPlaceholderName(label)) {
            setBrandName((prev) => prev || label || '');
          }
        }

        const websiteLink = brand?.links?.find(
          (link) => link?.category === LinkCategory.WEBSITE && !!link.url,
        );

        if (websiteLink?.url && !websiteEditedRef.current) {
          setWebsiteUrl((prev) => prev || websiteLink.url || '');
        }

        const requestedAccountType = parseOnboardingAccountType(
          searchParams.get('accountType') ??
            localStorage.getItem(ONBOARDING_STORAGE_KEYS.accountType),
        );
        if (!accountTypeEditedRef.current) {
          setAccountType(
            requestedAccountType ?? org?.accountType ?? org?.category ?? null,
          );
        }
      } catch (error) {
        logger.error('Failed to prefill onboarding data', error);
        if (!controller.signal.aborted) {
          setErrorMessage(translate('errors.initialization'));
        }
      } finally {
        if (!controller.signal.aborted) {
          setPrefillReady(true);
        }
      }
    };

    prefill();

    return () => {
      controller.abort();
    };
  }, [getToken, searchParams, translate]);

  const resolveBrandId = useCallback(
    async (token: string): Promise<string | null> => {
      if (brandIdRef.current) {
        return brandIdRef.current;
      }
      const brands = await UsersService.getInstance(token).findMeBrands({
        limit: 1,
      });
      brandIdRef.current = brands[0]?.id ?? null;
      return brandIdRef.current;
    },
    [],
  );

  const resolveOrgId = useCallback(
    async (token: string): Promise<string | null> => {
      if (orgIdRef.current) {
        return orgIdRef.current;
      }
      const organizations =
        await UsersService.getInstance(token).findMeOrganizations();
      orgIdRef.current = organizations[0]?.id ?? null;
      return orgIdRef.current;
    },
    [],
  );

  const handleAccountTypeSelect = useCallback(
    (category: OrganizationCategory) => {
      accountTypeEditedRef.current = true;
      setAccountType(category);
      setErrorMessage(null);
    },
    [],
  );

  const handleProfileContinue = useCallback(async () => {
    if (!accountType || submitting) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const token = await resolveAuthToken(getToken);
      if (!token) throw new Error('Authentication is unavailable');
      const orgId = await resolveOrgId(token);
      if (!orgId)
        throw new Error('No organization found for the current workspace');
      await OrganizationsService.getInstance(token).updateAccountType(
        orgId,
        accountType,
      );
      setOnboardingAccountType(accountType);
      localStorage.removeItem(ONBOARDING_STORAGE_KEYS.accountType);
      setStep(2);
    } catch (error) {
      logger.error('Failed to set account type', error);
      setErrorMessage(translate('errors.accountType'));
    } finally {
      setSubmitting(false);
    }
  }, [
    accountType,
    submitting,
    getToken,
    resolveOrgId,
    setOnboardingAccountType,
    translate,
  ]);

  const handleContinue = useCallback(async () => {
    const effectiveBrandName = brandName.trim();
    const effectiveOrganizationName = effectiveBrandName;
    if (!effectiveBrandName || submitting) return;

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const token = await resolveAuthToken(getToken);
      if (!token) {
        throw new Error('Authentication is unavailable');
      }

      const brandUrl = normalizeWebsiteUrl(websiteUrl);
      const brandDomain = extractBrandDomain(brandUrl);

      localStorage.setItem(
        ONBOARDING_STORAGE_KEYS.brandName,
        effectiveBrandName,
      );

      if (brandDomain) {
        localStorage.setItem(ONBOARDING_STORAGE_KEYS.brandDomain, brandDomain);
      } else {
        localStorage.removeItem(ONBOARDING_STORAGE_KEYS.brandDomain);
      }

      const brandId = await resolveBrandId(token);
      if (!brandId) {
        throw new Error('No brand found for the current workspace');
      }

      const brandsService = BrandsService.getInstance(token);
      const trimmedTargetAudience = targetAudience.trim();
      const trimmedTone = tone.trim();
      const guidancePrompt = buildBrandGuidance({
        brandName: effectiveBrandName,
        organizationName: effectiveOrganizationName,
        ...(trimmedTargetAudience
          ? { targetAudience: trimmedTargetAudience }
          : {}),
        ...(trimmedTone ? { tone: trimmedTone } : {}),
      });
      const voiceConfig: IBrandAgentConfig | undefined =
        trimmedTargetAudience || trimmedTone
          ? {
              voice: {
                ...(trimmedTargetAudience
                  ? { audience: [trimmedTargetAudience] }
                  : {}),
                ...(trimmedTone ? { tone: trimmedTone } : {}),
              },
            }
          : undefined;

      await brandsService.renameWithOrganizationSync(
        brandId,
        effectiveBrandName,
        {
          description: guidancePrompt,
          organizationLabel: effectiveOrganizationName,
          text: guidancePrompt,
          ...(voiceConfig ? { agentConfig: voiceConfig } : {}),
        },
      );

      if (brandUrl) {
        // Brand rename above already persisted, so a scrape issue never
        // loses onboarding progress — the user can fix the site/URL (or just
        // leave it) and press Continue again, which retries this same call
        // (#5080). We stop short of `handleStepComplete` here so the
        // classified message is visible before the wizard navigates away.
        let scrapeResult: Awaited<ReturnType<typeof brandsService.scrape>>;
        try {
          scrapeResult = await brandsService.scrape(brandId, {
            brandName: effectiveBrandName,
            brandUrl,
            organizationName: effectiveOrganizationName,
            ...(trimmedTone
              ? { additionalNotes: `Preferred tone: ${trimmedTone}` }
              : {}),
            ...(trimmedTargetAudience
              ? { targetAudience: trimmedTargetAudience }
              : {}),
          });
        } catch (scrapeError) {
          logger.error('Failed to scrape brand during onboarding', scrapeError);
          const code = resolveBrandScrapeIssueCode(
            extractBrandScrapeErrorCode(scrapeError),
          );
          setErrorMessage(translate(`errors.scrapeCodes.${code}`));
          setSubmitting(false);
          return;
        }

        if (scrapeResult.scrapeWarning) {
          const code = resolveBrandScrapeIssueCode(
            scrapeResult.scrapeWarning.code,
          );
          setErrorMessage(translate(`errors.scrapeCodes.${code}`));
          setSubmitting(false);
          return;
        }
      }

      await handleStepComplete('brand');
    } catch (error) {
      logger.error('Failed to continue onboarding', error);
      setErrorMessage(translate('errors.continue'));
      setSubmitting(false);
    }
  }, [
    getToken,
    brandName,
    submitting,
    websiteUrl,
    resolveBrandId,
    targetAudience,
    tone,
    handleStepComplete,
    translate,
  ]);

  const handleSkipOnboarding = useCallback(async () => {
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const token = await resolveAuthToken(getToken);
      if (!token) {
        if (isDesktopClient()) {
          push(APP_ROUTES.DESKTOP.LOCAL);
          return;
        }
        throw new Error('Authentication is unavailable');
      }

      const orgId = await resolveOrgId(token);
      if (!orgId) {
        throw new Error('No organization found for the current workspace');
      }

      if (accountType) {
        try {
          await OrganizationsService.getInstance(token).updateAccountType(
            orgId,
            accountType,
          );
          setOnboardingAccountType(accountType);
          localStorage.removeItem(ONBOARDING_STORAGE_KEYS.accountType);
        } catch (error) {
          logger.error(
            'Failed to save optional profile while skipping onboarding',
            error,
          );
        }
      }

      // Skip completes the onboarding *gate* so we do not force the wizard
      // again. Brand setup stays at `/onboarding/brand` for later.
      await OrganizationsService.getInstance(token).patchSettings(orgId, {
        isFirstLogin: false,
      });
      await UsersService.getInstance(token).patchMe({
        isOnboardingCompleted: true,
      });
      push('/');
    } catch (error) {
      logger.error('Failed to skip onboarding', error);
      setErrorMessage(translate('errors.skip'));
      setSubmitting(false);
    }
  }, [
    accountType,
    getToken,
    push,
    resolveOrgId,
    setOnboardingAccountType,
    translate,
  ]);

  const handleWebsiteUrlChange = useCallback((value: string) => {
    websiteEditedRef.current = true;
    setWebsiteUrl(value);
    const domain = extractBrandDomain(value);
    if (domain && !nameEditedRef.current) {
      setBrandName(deriveBrandNameFromDomain(domain));
    }
  }, []);

  useEffect(() => {
    if (step > 2 || !prefillReady || websiteEditedRef.current || websiteUrl)
      return;
    const suggestion = resolveSignupBrandDomain({ email: currentUser?.email });
    if (!suggestion.websiteUrl) return;
    setWebsiteUrl(suggestion.websiteUrl);
    if (!nameEditedRef.current) {
      setBrandName((prev) => prev || suggestion.brandName || '');
    }
  }, [step, prefillReady, currentUser?.email, websiteUrl]);

  const handleNext = () => {
    if (submitting) return;
    if (step === 1) {
      void handleProfileContinue();
    } else if (step === 2 && brandName.trim()) {
      nameEditedRef.current = true;
      websiteEditedRef.current = true;
      setErrorMessage(null);
      setStep(3);
    } else if (step === 3) {
      void handleContinue();
    }
  };

  return (
    <div ref={sectionRef}>
      <BrandStepHeader step={step} />

      {step === 1 && (
        <BrandAccountTypeSelector
          accountType={accountType}
          onSelect={handleAccountTypeSelect}
          disabled={submitting}
        />
      )}

      <BrandFormFields
        brandName={brandName}
        step={step}
        canContinue={step === 1 ? !!accountType : !!brandName.trim()}
        websiteUrl={websiteUrl}
        targetAudience={targetAudience}
        tone={tone}
        errorMessage={errorMessage}
        submitting={submitting}
        onBrandNameChange={(value) => {
          nameEditedRef.current = true;
          setBrandName(value);
        }}
        onWebsiteUrlChange={handleWebsiteUrlChange}
        onTargetAudienceChange={setTargetAudience}
        onToneChange={setTone}
        onContinue={handleNext}
        onBack={() => {
          setErrorMessage(null);
          setStep((current) => current - 1);
        }}
        onSkip={handleSkipOnboarding}
      />
    </div>
  );
}

export default function BrandContent() {
  return (
    <div>
      <Suspense fallback={null}>
        <BrandContentContent />
      </Suspense>
    </div>
  );
}
