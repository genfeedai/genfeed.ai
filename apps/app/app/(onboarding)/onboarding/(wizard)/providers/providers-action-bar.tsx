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
  onByokClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  onServerContinue: () => void;
  onCloudContinue: () => void;
  onBack: () => void;
};

export default function ProvidersActionBar({
  loading,
  pendingMode,
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
          <Link
            href="/settings/api-keys"
            onClick={(event) => {
              onByokClick(event);
            }}
            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-white/75 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white"
          >
            Add my own API keys
          </Link>

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
            className="w-full md:w-auto"
          />

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
            className="w-full rounded-full border border-white/10 bg-white/[0.03] text-white/75 hover:border-white/15 hover:bg-white/[0.06] hover:text-white md:w-auto"
          />
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
