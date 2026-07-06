'use client';

import { useOnboarding } from '@contexts/onboarding/onboarding-context';
import { LinkCategory, type OrganizationCategory } from '@genfeedai/enums';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useGsapTimeline } from '@hooks/ui/use-gsap-entrance';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { UsersService } from '@services/organization/users.service';
import { BrandsService } from '@services/social/brands.service';
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
  const { handleStepComplete } = useOnboarding();
  const searchParams = useSearchParams();
  const isAutoRequested = searchParams.get('auto') === 'true';
  const initialBrandName =
    localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandName) ?? '';
  const initialWebsiteUrl =
    localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandDomain) ?? '';

  const [brandName, setBrandName] = useState(() => initialBrandName);
  const [organizationName, setOrganizationName] = useState(
    () => initialBrandName,
  );
  const [websiteUrl, setWebsiteUrl] = useState(() => initialWebsiteUrl);
  const [targetAudience, setTargetAudience] = useState('');
  const [tone, setTone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [accountType, setAccountType] = useState<OrganizationCategory | null>(
    null,
  );
  const autoScanRef = useRef(false);
  const prefetchedRef = useRef(false);
  // Resource ids resolved during prefill; the collapsed onboarding routes are
  // now resource PATCH/POST on /brands and /organizations (REST audit #1354).
  const brandIdRef = useRef<string | null>(null);
  const orgIdRef = useRef<string | null>(null);

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

        if (brand?.id) {
          brandIdRef.current = brand.id;
        }
        if (org?.id) {
          orgIdRef.current = org.id;
        }

        if (!isPlaceholderName(brand?.label)) {
          setBrandName((prev) => prev || brand.label);
        }

        if (!isPlaceholderName(org?.label)) {
          setOrganizationName((prev) => prev || org.label);
        } else if (!isPlaceholderName(brand?.label)) {
          setOrganizationName((prev) => prev || brand.label);
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

  const resolveBrandId = useCallback(
    async (token: string): Promise<string | null> => {
      if (brandIdRef.current) {
        return brandIdRef.current;
      }
      const brands = await UsersService.getInstance(token).findMeBrands({
        pagination: false,
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
    async (category: OrganizationCategory) => {
      setAccountType(category);
      try {
        const token = await resolveAuthToken(getToken);
        if (!token) {
          return;
        }
        const orgId = await resolveOrgId(token);
        if (!orgId) {
          return;
        }
        await OrganizationsService.getInstance(token).updateAccountType(
          orgId,
          category,
        );
      } catch (error) {
        logger.error('Failed to set account type', error);
      }
    },
    [getToken, resolveOrgId],
  );

  const handleContinue = useCallback(
    async ({
      brandNameOverride,
      organizationNameOverride,
      skipWebsite = false,
      urlOverride,
    }: {
      brandNameOverride?: string;
      organizationNameOverride?: string;
      skipWebsite?: boolean;
      urlOverride?: string;
    } = {}) => {
      const effectiveBrandName = (brandNameOverride ?? brandName).trim();
      const effectiveOrganizationName = (
        organizationNameOverride ?? organizationName
      ).trim();
      if (!effectiveBrandName || !effectiveOrganizationName) {
        return;
      }

      setSubmitting(true);

      try {
        const token = await resolveAuthToken(getToken);
        if (!token) {
          return;
        }

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
        const voiceConfig =
          trimmedTargetAudience || trimmedTone
            ? {
                voice: {
                  ...(trimmedTargetAudience
                    ? { audience: trimmedTargetAudience }
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
          // Enrichment should not block the user from continuing.
          void brandsService
            .scrape(brandId, {
              brandName: effectiveBrandName,
              brandUrl,
              organizationName: effectiveOrganizationName,
              ...(trimmedTone
                ? { additionalNotes: `Preferred tone: ${trimmedTone}` }
                : {}),
              ...(trimmedTargetAudience
                ? { targetAudience: trimmedTargetAudience }
                : {}),
            })
            .catch((error) => {
              logger.error('Failed to scrape brand during onboarding', error);
            });
        }

        await handleStepComplete('brand');
      } catch (error) {
        logger.error('Failed to continue onboarding', error);
        setSubmitting(false);
      }
    },
    [
      getToken,
      brandName,
      organizationName,
      websiteUrl,
      resolveBrandId,
      targetAudience,
      tone,
      handleStepComplete,
    ],
  );

  const handleSkipOnboarding = useCallback(async () => {
    setSubmitting(true);

    try {
      const token = await resolveAuthToken(getToken);
      if (!token) {
        return;
      }

      const orgId = await resolveOrgId(token);
      if (!orgId) {
        throw new Error('No organization found for the current workspace');
      }

      // Mark first-login complete on the org settings resource (was /onboarding/skip).
      await OrganizationsService.getInstance(token).patchSettings(orgId, {
        isFirstLogin: false,
      });
      await UsersService.getInstance(token).patchMe({
        isOnboardingCompleted: true,
      });
      push('/');
    } catch (error) {
      logger.error('Failed to skip onboarding', error);
      setSubmitting(false);
    }
  }, [getToken, push, resolveOrgId]);

  const handleWebsiteUrlChange = useCallback((value: string) => {
    setWebsiteUrl(value);

    const domain = extractBrandDomain(value);
    if (!domain) {
      return;
    }

    const inferredBrandName = deriveBrandNameFromDomain(domain);
    setBrandName((prev) => prev || inferredBrandName);
    setOrganizationName((prev) => prev || inferredBrandName);
  }, []);

  // Auto mode pre-fills from the corporate email domain; the user confirms.
  useEffect(() => {
    if (autoScanRef.current) {
      return;
    }

    if (isAutoRequested && websiteUrl) {
      const inferredBrandName =
        brandName.trim() || deriveBrandNameFromDomain(websiteUrl);
      autoScanRef.current = true;
      setBrandName((prev) => prev || inferredBrandName);
      setOrganizationName((prev) => prev || inferredBrandName);
    }
  }, [isAutoRequested, websiteUrl, brandName]);

  return (
    <div ref={sectionRef}>
      <BrandStepHeader />

      <BrandAccountTypeSelector
        accountType={accountType}
        onSelect={handleAccountTypeSelect}
      />

      <BrandFormFields
        brandName={brandName}
        organizationName={organizationName}
        websiteUrl={websiteUrl}
        targetAudience={targetAudience}
        tone={tone}
        submitting={submitting}
        onBrandNameChange={setBrandName}
        onOrganizationNameChange={setOrganizationName}
        onWebsiteUrlChange={handleWebsiteUrlChange}
        onTargetAudienceChange={setTargetAudience}
        onToneChange={setTone}
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
