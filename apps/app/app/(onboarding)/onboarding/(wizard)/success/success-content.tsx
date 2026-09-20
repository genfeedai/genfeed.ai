'use client';

import { useCompleteOnboarding } from '@app/(onboarding)/onboarding/(wizard)/_expert/use-complete-onboarding.hook';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { ButtonVariant } from '@genfeedai/contracts';
import { ONBOARDING_SIGNUP_GIFT_CREDITS } from '@genfeedai/contracts/types';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useGsapTimeline } from '@hooks/ui/use-gsap-entrance';
import { logger } from '@services/core/logger.service';
import { UsersService } from '@services/organization/users.service';
import { Button } from '@ui/primitives/button';
import {
  CircleCheck,
  ImageIcon,
  Music,
  ScanFace,
  Sparkles,
  Video,
} from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';

const CONTENT_TYPES = [
  { icon: ImageIcon, id: 'image', title: 'Images' },
  { icon: Video, id: 'video', title: 'Videos' },
  { icon: ScanFace, id: 'avatar', title: 'Avatars' },
  { icon: Music, id: 'music', title: 'Music' },
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
  const { currentUser } = useCurrentUser();
  const completeOnboarding = useCompleteOnboarding();
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

    await completeOnboarding();
  };

  return (
    <div ref={sectionRef} className="max-w-lg mx-auto text-center pt-24">
      {/* Success icon */}
      <div className="success-icon opacity-0 flex justify-center mb-8">
        <div className="size-20 bg-secondary shadow-border rounded-full flex items-center justify-center">
          <CircleCheck className="size-10 text-success" />
        </div>
      </div>

      {/* Headline */}
      <h1 className="success-headline opacity-0 mb-4 text-4xl font-semibold leading-none tracking-tight text-foreground md:text-5xl text-balance">
        Welcome to Genfeed!
      </h1>

      <div className="success-credit-reveal opacity-0 mb-8 inline-flex items-center gap-3 rounded-full bg-secondary shadow-border px-5 py-3 text-left">
        <Sparkles className="size-5 text-foreground" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Starter Credits Ready
          </p>
          <p className="text-sm text-foreground">
            <span className="tabular-nums">
              {ONBOARDING_SIGNUP_GIFT_CREDITS}
            </span>{' '}
            credits are waiting in your workspace.
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
            className="size-72 rounded-lg object-cover border border-border outline-media"
          />
        </div>
      )}

      {/* Content type preferences */}
      <div className="success-preferences opacity-0 mb-10">
        <p className="text-sm text-muted-foreground mb-4">
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
                className={`inline-flex items-center gap-2 px-4 py-2 border text-sm transition-colors ${
                  isSelected
                    ? 'ring-1 ring-border-strong bg-hover text-foreground border-transparent'
                    : 'border-border bg-background-tertiary text-muted-foreground hover:border-border-strong'
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
          variant={ButtonVariant.DEFAULT}
          onClick={handleEnterWorkspace}
          icon={<Sparkles className="size-4" />}
          label="Enter Workspace"
        />
      </div>
    </div>
  );
}
