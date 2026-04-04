'use client';

import { useAuth } from '@clerk/nextjs';
import {
  ButtonSize,
  ButtonVariant,
  OrganizationCategory,
} from '@genfeedai/enums';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useGsapTimeline } from '@hooks/ui/use-gsap-entrance';
import { logger } from '@services/core/logger.service';
import { OnboardingService } from '@services/onboarding/onboarding.service';
import { OnboardingFunnelService } from '@services/onboarding/onboarding-funnel.service';
import { UsersService } from '@services/organization/users.service';
import Button from '@ui/buttons/base/Button';
import { Input } from '@ui/primitives/input';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HiArrowRight,
  HiBriefcase,
  HiGlobeAlt,
  HiSparkles,
  HiUserCircle,
  HiUserGroup,
} from 'react-icons/hi2';

const ACCOUNT_TYPES = [
  {
    category: OrganizationCategory.CREATOR,
    description: 'Individual content creator or influencer',
    icon: HiUserCircle,
    label: 'Creator',
  },
  {
    category: OrganizationCategory.BUSINESS,
    description: 'Company, brand, or e-commerce store',
    icon: HiBriefcase,
    label: 'Business',
  },
  {
    category: OrganizationCategory.AGENCY,
    description: 'Managing content for multiple clients',
    icon: HiUserGroup,
    label: 'Agency',
  },
];

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

function deriveBrandNameFromDomain(domain: string): string {
  return domain
    .replace(/\.[a-z]{2,}$/i, '')
    .split(/[.\-_]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
    .trim();
}

export default function BrandContent() {
  const sectionRef = useGsapTimeline<HTMLDivElement>({ steps: TIMELINE_STEPS });
  const { getToken } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [brandName, setBrandName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
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
        const token = await resolveClerkToken(getToken);
        if (!token || controller.signal.aborted) {
          return;
        }

        prefetchedRef.current = true;
        const service = UsersService.getInstance(token);

        const [brands, organizations] = await Promise.all([
          service.findMeBrands({ pagination: false }),
          service.findMeOrganizations(),
        ]);

        if (controller.signal.aborted) {
          return;
        }

        const brand = brands[0];
        const org = organizations[0];

        if (brand?.label) {
          setBrandName((prev) => prev || brand.label);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken]);

  const handleAccountTypeSelect = useCallback(
    async (category: OrganizationCategory) => {
      setAccountType(category);
      try {
        const token = await resolveClerkToken(getToken);
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
    async (urlOverride?: string, brandNameOverride?: string) => {
      const effectiveBrandName = (brandNameOverride ?? brandName).trim();
      if (!effectiveBrandName) {
        return;
      }

      setSubmitting(true);

      try {
        const token = await resolveClerkToken(getToken);
        if (!token) {
          return;
        }

        const url = urlOverride || websiteUrl.trim();
        const service = OnboardingService.getInstance(token);

        // Fire-and-forget: setup brand in background, don't await
        const brandUrl = url
          ? url.includes('://')
            ? url
            : `https://${url}`
          : `https://${effectiveBrandName.toLowerCase().replace(/\s+/g, '')}.com`;

        service
          .setupBrand({
            brandName: effectiveBrandName,
            brandUrl,
          })
          .catch((error) => {
            logger.error('Background brand setup failed', error);
          });

        router.push('/onboarding/plan');
      } catch (error) {
        logger.error('Failed to continue onboarding', error);
        setSubmitting(false);
      }
    },
    [getToken, brandName, websiteUrl, router],
  );

  // Auto-scan from corporate email flow
  useEffect(() => {
    if (autoScanRef.current) {
      return;
    }

    const isAuto = searchParams.get('auto') === 'true';
    const storedDomain = localStorage.getItem('gf_brand_domain');

    if (isAuto && storedDomain) {
      const inferredBrandName = deriveBrandNameFromDomain(storedDomain);
      autoScanRef.current = true;
      setWebsiteUrl(storedDomain);
      setBrandName((prev) => prev || inferredBrandName);
      handleContinue(storedDomain, inferredBrandName).catch((error) => {
        logger.error('Failed to continue auto onboarding flow', error);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleContinue, searchParams.get]);

  return (
    <div ref={sectionRef}>
      {/* Badge */}
      <div className="step-badge opacity-0 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-[0.2em] mb-8">
        <HiSparkles className="h-3 w-3" />
        Step 1 of 2
      </div>

      <h1 className="step-headline opacity-0 text-4xl md:text-5xl font-serif leading-none tracking-tighter text-white mb-4">
        Set up your <span className="font-light italic">brand.</span>
      </h1>

      <p className="step-description opacity-0 text-lg text-white/40 mb-8 max-w-lg">
        Confirm your workspace details so we can personalize your first content
        setup.
      </p>

      {/* Account type selector */}
      <div className="step-form opacity-0 max-w-md mb-8">
        <p className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3">
          I am a...
        </p>
        <div className="grid grid-cols-3 gap-3">
          {ACCOUNT_TYPES.map(({ category, description, icon: Icon, label }) => (
            <Button
              key={category}
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              onClick={() => handleAccountTypeSelect(category)}
              className={`group p-4 border text-center transition-all ${
                accountType === category
                  ? 'border-white/30 bg-white/[0.08]'
                  : 'border-white/[0.08] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
              }`}
            >
              <Icon
                className={`h-6 w-6 mx-auto mb-2 transition-colors ${
                  accountType === category
                    ? 'text-white'
                    : 'text-white/40 group-hover:text-white/70'
                }`}
              />
              <span
                className={`text-sm font-medium block ${
                  accountType === category ? 'text-white' : 'text-white/60'
                }`}
              >
                {label}
              </span>
              <span className="text-[10px] text-white/30 leading-tight block mt-1">
                {description}
              </span>
            </Button>
          ))}
        </div>
      </div>

      <div className="step-form opacity-0 max-w-md space-y-6">
        {/* Name */}
        <div>
          <label
            htmlFor="brand-name"
            className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2"
          >
            Name
            <span className="text-white/25 font-normal normal-case tracking-normal ml-1">
              (required)
            </span>
          </label>
          <Input
            id="brand-name"
            type="text"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="Your name or brand"
            required
            className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/20 text-sm focus:outline-none focus:border-white/30 transition-colors"
          />
        </div>

        {/* Website URL */}
        <div>
          <label
            htmlFor="brand-website-url"
            className="block text-xs font-medium text-white/50 uppercase tracking-wider mb-2"
          >
            Website URL
            <span className="text-white/20 font-normal normal-case tracking-normal ml-1">
              (optional)
            </span>
          </label>
          <div className="flex items-center">
            <span className="px-4 py-3 bg-white/[0.02] border border-r-0 border-white/[0.08] text-white/30 text-sm">
              <HiGlobeAlt className="h-4 w-4" />
            </span>
            <Input
              id="brand-website-url"
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://yoursite.com"
              className="flex-1 px-4 py-3 bg-white/[0.04] border border-white/[0.08] text-white placeholder:text-white/20 text-sm focus:outline-none focus:border-white/30 transition-colors"
            />
          </div>
          <p className="text-xs text-white/20 mt-1.5">
            We&apos;ll extract your brand colors, logo, and voice
          </p>
        </div>

        {/* Continue button */}
        <div className="step-actions opacity-0">
          <Button
            variant={ButtonVariant.WHITE}
            size={ButtonSize.DEFAULT}
            label="Continue"
            icon={<HiArrowRight className="h-4 w-4" />}
            isLoading={submitting}
            isDisabled={!brandName.trim()}
            onClick={() => handleContinue()}
          />
        </div>
      </div>
    </div>
  );
}
