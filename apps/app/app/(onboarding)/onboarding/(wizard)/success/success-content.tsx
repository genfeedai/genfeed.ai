'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { APP_ROUTES, createBrandAppRoute } from '@genfeedai/constants';
import { ButtonVariant } from '@genfeedai/enums';
import { ONBOARDING_SIGNUP_GIFT_CREDITS } from '@genfeedai/types';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthUser } from '@hooks/auth/use-auth-user/use-auth-user';
import { useGsapTimeline } from '@hooks/ui/use-gsap-entrance';
import { logger } from '@services/core/logger.service';
import { UsersService } from '@services/organization/users.service';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { useState } from 'react';
import { BsPersonBoundingBox } from 'react-icons/bs';
import {
  HiCheckCircle,
  HiMusicalNote,
  HiPhoto,
  HiSparkles,
  HiVideoCamera,
} from 'react-icons/hi2';
import { ANALYTICS_EVENTS, captureAnalyticsEvent } from '@/lib/analytics';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';

const CONTENT_TYPES = [
  { icon: HiPhoto, id: 'image', title: 'Images' },
  { icon: HiVideoCamera, id: 'video', title: 'Videos' },
  { icon: BsPersonBoundingBox, id: 'avatar', title: 'Avatars' },
  { icon: HiMusicalNote, id: 'music', title: 'Music' },
] as const;

const TIMELINE_STEPS = [
  {
    duration: 1,
    from: { opacity: 0, scale: 0.9 },
    selector: '.success-icon',
  },
  {
    duration: 0.8,
    from: { opacity: 0, y: 20 },
    offset: '-=0.4',
    selector: '.success-headline',
  },
  {
    duration: 0.8,
    from: { opacity: 0, y: 20 },
    offset: '-=0.4',
    selector: '.success-preview',
  },
  {
    duration: 0.8,
    from: { opacity: 0, scale: 0.95, y: 16 },
    offset: '-=0.35',
    selector: '.success-credit-reveal',
  },
  {
    duration: 0.8,
    from: { opacity: 0, y: 20 },
    offset: '-=0.4',
    selector: '.success-preferences',
  },
  {
    duration: 0.8,
    from: { opacity: 0, y: 20 },
    offset: '-=0.3',
    selector: '.success-cta',
  },
];

export default function SuccessContent() {
  const { getToken } = useAuthIdentity();
  const { user } = useAuthUser();
  const { currentUser } = useCurrentUser();
  const { selectedBrand } = useBrand();
  const sectionRef = useGsapTimeline<HTMLDivElement>({ steps: TIMELINE_STEPS });
  const [previewUrl] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(ONBOARDING_STORAGE_KEYS.previewUrl);
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleType = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleEnterWorkspace = async () => {
    // Save content preferences if any selected
    if (selected.size > 0 && currentUser) {
      try {
        const token = await resolveAuthToken(getToken);
        if (token) {
          const service = UsersService.getInstance(token);
          await service.patchSettings(currentUser.id, {
            contentPreferences: Array.from(selected),
          });
        }
      } catch (error) {
        logger.error('Failed to save content preferences', error);
      }
    }

    // Mark onboarding complete and refresh the active auth/session cache.
    // Onboarding completion is a field write on the user resource; the proactive
    // + cache-invalidation cascade lives behind PATCH /users/me (REST audit #1354).
    try {
      const token = await resolveAuthToken(getToken, { forceRefresh: true });
      if (token) {
        await UsersService.getInstance(token).patchMe({
          isOnboardingCompleted: true,
        });
        captureAnalyticsEvent(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {});
      }
      await user?.reload();
    } catch (error) {
      logger.error('Failed to complete funnel', error);
    }

    // Clean up localStorage keys
    localStorage.removeItem(ONBOARDING_STORAGE_KEYS.previewUrl);
    localStorage.removeItem(ONBOARDING_STORAGE_KEYS.brandDomain);
    localStorage.removeItem(ONBOARDING_STORAGE_KEYS.brandName);
    localStorage.removeItem(ONBOARDING_STORAGE_KEYS.accessMode);
    localStorage.removeItem(ONBOARDING_STORAGE_KEYS.source);
    localStorage.removeItem(ONBOARDING_STORAGE_KEYS.contentType);

    const org = selectedBrand?.organization;
    const orgSlug =
      org && typeof org === 'object' && 'slug' in org
        ? (org as { slug: string }).slug
        : '';
    const brandSlug = selectedBrand?.slug ?? '';

    if (orgSlug && brandSlug) {
      window.location.assign(
        createBrandAppRoute(orgSlug, brandSlug, '/workspace/overview'),
      );
    } else {
      window.location.assign(APP_ROUTES.WORKSPACE.OVERVIEW);
    }
  };

  return (
    <div ref={sectionRef} className="max-w-lg mx-auto text-center pt-24">
      {/* Success icon */}
      <div className="success-icon opacity-0 flex justify-center mb-8">
        <div className="size-20 bg-secondary shadow-border rounded-full flex items-center justify-center">
          <HiCheckCircle className="size-10 text-success" />
        </div>
      </div>

      {/* Headline */}
      <h1 className="success-headline opacity-0 mb-4 text-4xl font-semibold leading-none tracking-tight text-white md:text-5xl">
        Welcome to Genfeed!
      </h1>

      <div className="success-credit-reveal opacity-0 mb-8 inline-flex items-center gap-3 rounded-full bg-secondary shadow-border px-5 py-3 text-left">
        <HiSparkles className="size-5 text-foreground" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Starter Credits Ready
          </p>
          <p className="text-sm text-white">
            {ONBOARDING_SIGNUP_GIFT_CREDITS} credits are waiting in your
            workspace.
          </p>
        </div>
      </div>

      {/* Preview image */}
      {previewUrl && (
        <div className="success-preview opacity-0 flex justify-center mb-10">
          <Image
            src={previewUrl}
            alt="Your brand preview"
            width={288}
            height={288}
            className="size-72 rounded-lg object-cover border border-white/10"
          />
        </div>
      )}

      {/* Content type preferences */}
      <div className="success-preferences opacity-0 mb-10">
        <p className="text-sm text-white/50 mb-4">
          What do you want to create?
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {CONTENT_TYPES.map(({ id, title, icon: Icon }) => {
            const isSelected = selected.has(id);

            return (
              <Button
                key={id}
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                onClick={() => toggleType(id)}
                className={`inline-flex items-center gap-2 px-4 py-2 border text-sm transition-all ${
                  isSelected
                    ? 'ring-1 ring-border-strong bg-hover text-white border-transparent'
                    : 'border-white/[0.08] bg-white/[0.02] text-white/50 hover:border-white/20'
                }`}
              >
                <Icon className="size-4" />
                {title}
                {isSelected && (
                  <svg
                    aria-hidden="true"
                    className="size-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </Button>
            );
          })}
        </div>
      </div>

      {/* CTA */}
      <div className="success-cta opacity-0">
        <Button
          variant={ButtonVariant.WHITE}
          onClick={handleEnterWorkspace}
          icon={<HiSparkles className="size-4" />}
          label="Enter Workspace"
        />
      </div>
    </div>
  );
}
