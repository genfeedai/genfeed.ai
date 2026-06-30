'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { OnboardingAccessMode } from '@genfeedai/interfaces';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import type { MouseEvent } from 'react';
import { HiArrowLeft, HiSparkles } from 'react-icons/hi2';

type Props = {
  loading: boolean;
  pendingMode: OnboardingAccessMode | null;
  selectedMode: OnboardingAccessMode | null;
  onByokClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  onServerContinue: () => void;
  onCloudContinue: () => void;
  onBack: () => void;
};

const CURRENT_RING = 'ring-1 ring-emerald-400/40';

function CurrentBadge() {
  return (
    <span className="absolute -top-2 right-3 z-10 rounded-full border border-emerald-400/30 bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
      Current
    </span>
  );
}

export default function ProvidersActionBar({
  loading,
  pendingMode,
  selectedMode,
  onByokClick,
  onServerContinue,
  onCloudContinue,
  onBack,
}: Props) {
  return (
    <>
      <div className="provider-card opacity-0 flex flex-col gap-4 border border-white/[0.08] bg-white/[0.02] p-5 md:flex-row md:items-center md:justify-between md:p-6">
        <div className="text-sm text-white/45">
          Keep the default server access, open Organization API Keys if you want
          BYOK, or switch to Genfeed Cloud now if you want a managed setup with
          brand handoff.
        </div>

        <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
          <div className="relative w-full md:w-auto">
            {selectedMode === 'byok' ? <CurrentBadge /> : null}
            <Link
              href="/settings/api-keys"
              onClick={(event) => {
                onByokClick(event);
              }}
              className={`inline-flex w-full items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/75 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white md:w-auto ${
                selectedMode === 'byok' ? CURRENT_RING : ''
              }`}
            >
              Add my own API keys
            </Link>
          </div>

          <div className="relative w-full md:w-auto">
            {selectedMode === 'server' ? <CurrentBadge /> : null}
            <Button
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              onClick={() => {
                onServerContinue();
              }}
              label={
                loading
                  ? 'Loading summary...'
                  : pendingMode === 'server'
                    ? 'Saving server mode...'
                    : 'Continue with server defaults'
              }
              disabled={loading || pendingMode !== null}
              wrapperClassName="w-full md:w-auto"
              className={`w-full md:w-auto ${
                selectedMode === 'server' ? CURRENT_RING : ''
              }`}
            />
          </div>

          <div className="relative w-full md:w-auto">
            {selectedMode === 'cloud' ? <CurrentBadge /> : null}
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              onClick={() => {
                onCloudContinue();
              }}
              label={
                pendingMode === 'cloud'
                  ? 'Opening Genfeed Cloud...'
                  : 'Use Genfeed Cloud'
              }
              disabled={loading || pendingMode !== null}
              wrapperClassName="w-full md:w-auto"
              className={`w-full rounded-full border border-white/10 bg-white/[0.03] text-white/75 hover:border-white/15 hover:bg-white/[0.06] hover:text-white md:w-auto ${
                selectedMode === 'cloud' ? CURRENT_RING : ''
              }`}
            />
          </div>
        </div>
      </div>

      <div className="provider-card opacity-0 flex items-center justify-between gap-4 pt-2">
        <Button
          variant={ButtonVariant.GHOST}
          size={ButtonSize.SM}
          withWrapper={false}
          onClick={onBack}
          icon={<HiArrowLeft className="size-4" />}
          className="h-8 rounded-full border border-white/10 bg-white/[0.03] px-4 text-white/45 hover:border-white/15 hover:bg-white/[0.06] hover:text-white/75"
        >
          Back
        </Button>

        <div className="step-badge inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/60">
          <HiSparkles className="size-3" />
          Step 2 of 3
        </div>
      </div>
    </>
  );
}
