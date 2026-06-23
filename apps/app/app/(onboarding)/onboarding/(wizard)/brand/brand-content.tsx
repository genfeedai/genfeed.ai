'use client';

import { LinkCategory, type OrganizationCategory } from '@genfeedai/enums';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useGsapTimeline } from '@hooks/ui/use-gsap-entrance';
import { logger } from '@services/core/logger.service';
import { OnboardingService } from '@services/onboarding/onboarding.service';
import { OnboardingFunnelService } from '@services/onboarding/onboarding-funnel.service';
import { UsersService } from '@services/organization/users.service';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  deriveBrandNameFromDomain,
  extractBrandDomain,
  ONBOARDING_STORAGE_KEYS,
} from '@/lib/onboarding/onboarding-access.util';
import BrandAccountTypeSelector from './brand-account-type-selector';
import BrandFormFields from './brand-form-fields';
import BrandStepHeader from './brand-step-header';

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

function BrandContentContent() {
  const sectionRef = useGsapTimeline<HTMLDivElement>({ steps: TIMELINE_STEPS });
  const { getToken } = useAuthIdentity();
  const { push } = useRouter();
  const searchParams = useSearchParams();
  const isAutoRequested = searchParams.get('auto') === 'true';

  const [brandName, setBrandName] = useState(
    () => localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandName) ?? '',
  );
  const [websiteUrl, setWebsiteUrl] = useState(
    () => localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandDomain) ?? '',
  );
  const [submitting, setSubmitting] = useState(false);
  const [accountType, setAccountType] = useState<OrganizationCategory | null>(
    null,
  );
  const autoScanRef = useRef(false);
  const prefetchedRef = useRef(false);

  // Prefill form fields from existing brand/organization data
  useEffect(() => {
    if (prefetchedRef.current) {
      return;
    }

    const controller = new AbortController();

    const prefill = async () => {
      try {
        const token = await resolveAuthToken(getToken);
        if (!token || controller.signal.aborted) {
          return;
        }

        prefetchedRef.current = true;
        const service = UsersService.getInstance(token);

        if (controller.signal.aborted) {
          return;
        }

        const [brands, organizations] = await Promise.all([
          service.findMeBrands({ pagination: false }),
          service.findMeOrganizations(),
        ]);

        const brand = brands[0];
        const org = organizations[0];

        if (brand?.label) {
          setBrandName((prev) => prev || brand.label);
        }

        const websiteLink = brand?.links?.find(
          (link) => link?.category === LinkCategory.WEBSITE && !!link.url,
        );

        if (websiteLink?.url) {
          setWebsiteUrl((prev) => prev || websiteLink.url || '');
        }

        if (org?.accountType || org?.category) {
          setAccountType(
            (prev) => prev ?? (org.accountType || org.category || null),
          );
        }
      } catch (error) {
        logger.error('Failed to prefill onboarding data', error);
      }
    };

    prefill();

    return () => {
      controller.abort();
    };
  }, [getToken]);

  const handleAccountTypeSelect = useCallback(
    async (category: OrganizationCategory) => {
      setAccountType(category);
      try {
        const token = await resolveAuthToken(getToken);
        if (token) {
          const service = OnboardingFunnelService.getInstance(token);
          await service.setAccountType(category);
        }
      } catch (error) {
        logger.error('Failed to set account type', error);
      }
    },
    [getToken],
  );

  const handleContinue = useCallback(
    async ({
      brandNameOverride,
      skipWebsite = false,
      urlOverride,
    }: {
      brandNameOverride?: string;
      skipWebsite?: boolean;
      urlOverride?: string;
    } = {}) => {
      const effectiveBrandName = (brandNameOverride ?? brandName).trim();
      if (!effectiveBrandName) {
        return;
      }

      setSubmitting(true);

      try {
        const token = await resolveAuthToken(getToken);
        if (!token) {
          return;
        }

        const service = OnboardingService.getInstance(token);
        const brandUrl = skipWebsite
          ? null
          : normalizeWebsiteUrl(urlOverride ?? websiteUrl);
        const brandDomain = extractBrandDomain(brandUrl);

        localStorage.setItem(
          ONBOARDING_STORAGE_KEYS.brandName,
          effectiveBrandName,
        );

        if (brandDomain) {
          localStorage.setItem(
            ONBOARDING_STORAGE_KEYS.brandDomain,
            brandDomain,
          );
        } else {
          localStorage.removeItem(ONBOARDING_STORAGE_KEYS.brandDomain);
        }

        if (brandUrl) {
          await service.setupBrand({
            brandName: effectiveBrandName,
            brandUrl,
          });
        } else {
          await service.updateBrandName(effectiveBrandName);
        }

        push('/onboarding/providers');
      } catch (error) {
        logger.error('Failed to continue onboarding', error);
        setSubmitting(false);
      }
    },
    [getToken, brandName, websiteUrl, push],
  );

  const handleSkipOnboarding = useCallback(async () => {
    setSubmitting(true);

    try {
      const token = await resolveAuthToken(getToken);
      if (!token) {
        return;
      }

      await OnboardingService.getInstance(token).skip(
        'skipped-from-brand-step',
      );
      push('/');
    } catch (error) {
      logger.error('Failed to skip onboarding', error);
      setSubmitting(false);
    }
  }, [getToken, push]);

  // Auto-scan from corporate email flow.
  // websiteUrl and brandName are already initialised from localStorage in useState,
  // so we read them directly instead of re-reading localStorage and setting state.
  useEffect(() => {
    if (autoScanRef.current) {
      return;
    }

    if (isAutoRequested && websiteUrl) {
      const inferredBrandName =
        brandName.trim() || deriveBrandNameFromDomain(websiteUrl);
      autoScanRef.current = true;
      handleContinue({
        brandNameOverride: inferredBrandName,
        urlOverride: websiteUrl,
      }).catch((error) => {
        logger.error('Failed to continue auto onboarding flow', error);
      });
    }
  }, [handleContinue, isAutoRequested, websiteUrl, brandName]);

  return (
    <div ref={sectionRef}>
      <BrandStepHeader />

      <BrandAccountTypeSelector
        accountType={accountType}
        onSelect={handleAccountTypeSelect}
      />

      <BrandFormFields
        brandName={brandName}
        websiteUrl={websiteUrl}
        submitting={submitting}
        onBrandNameChange={setBrandName}
        onWebsiteUrlChange={setWebsiteUrl}
        onContinue={() => handleContinue()}
        onSkip={handleSkipOnboarding}
      />
    </div>
  );
}

export default function BrandContent() {
  return (
    <Suspense fallback={null}>
      <BrandContentContent />
    </Suspense>
  );
}
