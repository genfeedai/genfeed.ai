'use client';

import { useAuth, useSession, useUser } from '@clerk/nextjs';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { ButtonVariant } from '@genfeedai/enums';
import { ONBOARDING_SIGNUP_GIFT_CREDITS } from '@genfeedai/types';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { useGsapTimeline } from '@hooks/ui/use-gsap-entrance';
import { logger } from '@services/core/logger.service';
import { OnboardingFunnelService } from '@services/onboarding/onboarding-funnel.service';
import { UsersService } from '@services/organization/users.service';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { BsPersonBoundingBox } from 'react-icons/bs';
import {
  HiCheckCircle,
  HiMusicalNote,
  HiPhoto,
  HiSparkles,
  HiVideoCamera,
} from 'react-icons/hi2';

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
  const { getToken } = useAuth();
  const { session } = useSession();
  const { user } = useUser();
  const { currentUser } = useCurrentUser();
  const sectionRef = useGsapTimeline<HTMLDivElement>({ steps: TIMELINE_STEPS });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const preview = localStorage.getItem('gf_onboarding_preview_url');
    if (preview) {
      setPreviewUrl(preview);
    }
  }, []);

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
        const token = await resolveClerkToken(getToken);
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

    // Mark onboarding complete and refresh Clerk session token
    try {
      const token = await resolveClerkToken(getToken, { forceRefresh: true });
      if (token) {
        const funnelService = OnboardingFunnelService.getInstance(token);
        await funnelService.completeFunnel();
      }
      // Force Clerk to fetch fresh claims and reload the user object before leaving onboarding.
      await Promise.allSettled([session?.touch(), user?.reload()]);
    } catch (error) {
      logger.error('Failed to complete funnel', error);
    }

    // Clean up localStorage keys
    localStorage.removeItem('gf_onboarding_preview_url');
    localStorage.removeItem('gf_brand_domain');
    localStorage.removeItem('gf_onboarding_content_type');

    window.location.assign('/workspace/overview');
  };

  return (
    <div ref={sectionRef} className="max-w-lg mx-auto text-center pt-24">
      {/* Success icon */}
      <div className="success-icon opacity-0 flex justify-center mb-8">
        <div className="w-20 h-20 bg-white/5 border border-white/10 rounded-full flex items-center justify-center">
          <HiCheckCircle className="h-10 w-10 text-green-400" />
        </div>
      </div>

      {/* Headline */}
      <h1 className="success-headline opacity-0 text-4xl md:text-5xl font-serif leading-none tracking-tighter text-white mb-4">
        Welcome to <span className="font-light italic">Genfeed!</span>
      </h1>

      <div className="success-credit-reveal opacity-0 mb-8 inline-flex items-center gap-3 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-5 py-3 text-left">
        <HiSparkles className="h-5 w-5 text-emerald-300" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/80">
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
            className="w-72 h-72 rounded-lg object-cover border border-white/10"
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
                    ? 'border-white/30 bg-white/[0.08] text-white'
                    : 'border-white/[0.08] bg-white/[0.02] text-white/50 hover:border-white/20'
                }`}
              >
                <Icon className="h-4 w-4" />
                {title}
                {isSelected && (
                  <svg
                    aria-hidden="true"
                    className="w-3 h-3"
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
          icon={<HiSparkles className="h-4 w-4" />}
          label="Enter Workspace"
        />
      </div>
    </div>
  );
}
