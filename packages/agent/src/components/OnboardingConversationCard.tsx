import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { Textarea } from '@ui/primitives/textarea';
import { type ReactElement, useMemo, useState } from 'react';
import {
  HiOutlineBriefcase,
  HiOutlineBuildingOffice2,
  HiOutlinePhoto,
  HiOutlineSparkles,
  HiOutlineUser,
} from 'react-icons/hi2';

interface OnboardingConversationCardProps {
  signupGiftCredits?: number;
  totalJourneyCredits?: number;
  onStart: (message: string) => void;
  isDisabled?: boolean;
}

const ACCOUNT_TYPES = [
  {
    description: 'I am building my own creator workflow.',
    icon: HiOutlineUser,
    id: 'creator',
    label: 'Creator',
  },
  {
    description: 'I want GenFeed to learn my brand and business.',
    icon: HiOutlineBuildingOffice2,
    id: 'brand',
    label: 'Brand',
  },
  {
    description: 'I manage multiple clients or accounts.',
    icon: HiOutlineBriefcase,
    id: 'agency',
    label: 'Agency',
  },
] as const;

export function OnboardingConversationCard({
  onStart,
  isDisabled = false,
}: OnboardingConversationCardProps): ReactElement {
  const [accountType, setAccountType] =
    useState<(typeof ACCOUNT_TYPES)[number]['id']>('creator');
  const [sourceUrl, setSourceUrl] = useState('');
  const [context, setContext] = useState('');

  const canSubmit =
    (sourceUrl.trim().length > 0 || context.trim().length > 0) && !isDisabled;

  const selectedAccountType = useMemo(
    () =>
      ACCOUNT_TYPES.find((type) => type.id === accountType) ?? ACCOUNT_TYPES[0],
    [accountType],
  );

  const handleStart = () => {
    if (!canSubmit) {
      return;
    }

    const parts = [
      `I'm signing up as a ${selectedAccountType.label.toLowerCase()}.`,
    ];

    if (sourceUrl.trim()) {
      parts.push(`Use this as my main reference: ${sourceUrl.trim()}.`);
    }

    if (context.trim()) {
      parts.push(`Extra context: ${context.trim()}.`);
    }

    parts.push(
      'Create my onboarding brand profile and generate my first image right away based on this reply.',
    );

    onStart(parts.join(' '));
  };

  return (
    <div className="mx-auto mt-8 w-full max-w-3xl border border-white/[0.08] bg-[#0d1118] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center bg-foreground/[0.06] ring-1 ring-inset ring-foreground/[0.1]">
          <HiOutlineSparkles className="h-6 w-6 text-foreground/70" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-foreground/45">
            Guided Onboarding
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-foreground">
            Tell the agent what you create
          </h3>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground/68">
            Share your context and the agent will build your profile, then
            generate your first image immediately without sending you through
            another setup form.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <p className="mb-3 text-sm font-medium text-foreground">
          What best describes you?
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          {ACCOUNT_TYPES.map((type) => {
            const Icon = type.icon;
            const isSelected = type.id === accountType;

            return (
              <Button
                key={type.id}
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
                onClick={() => setAccountType(type.id)}
                className={cn(
                  'border px-4 py-4 text-left transition-colors',
                  isSelected
                    ? 'border-foreground/20 bg-foreground/[0.06]'
                    : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04]',
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-5 w-5 text-foreground/70" />
                  <span className="text-sm font-semibold text-foreground">
                    {type.label}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-foreground/55">
                  {type.description}
                </p>
              </Button>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-foreground">
            Website, X, or LinkedIn
          </span>
          <Input
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://your-site.com or https://x.com/yourhandle"
            className="h-12 border-white/[0.08] bg-white/[0.02] px-4 text-sm placeholder:text-foreground/35 focus:border-foreground/25"
          />
        </label>

        <div className="border border-white/[0.08] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <HiOutlinePhoto className="h-4 w-4 text-foreground/70" />
            First reward
          </div>
          <p className="mt-2 text-xs leading-5 text-foreground/58">
            The first meaningful reply should produce your first image, not send
            you to another setup form.
          </p>
        </div>
      </div>

      <label className="mt-4 block">
        <span className="mb-2 block text-sm font-medium text-foreground">
          What do you create?
        </span>
        <Textarea
          value={context}
          onChange={(event) => setContext(event.target.value)}
          placeholder="Describe your niche, audience, style, offer, or what you want the first image to communicate."
          className="min-h-32 border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm placeholder:text-foreground/35 focus:border-foreground/25"
        />
      </label>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-foreground/48">
          You can skip the URL and just describe your business if that is
          easier.
        </p>
        <Button
          variant={ButtonVariant.DEFAULT}
          withWrapper={false}
          onClick={handleStart}
          isDisabled={!canSubmit}
          className="inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold"
        >
          Start with my first image
        </Button>
      </div>
    </div>
  );
}
