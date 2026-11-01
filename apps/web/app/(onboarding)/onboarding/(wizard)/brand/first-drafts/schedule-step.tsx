'use client';
import type { FirstDraftsScheduleProps } from '@/features/onboarding/props/first-drafts.props';
import ConnectPlatforms from './connect-platforms';

export default function ScheduleStep({ brandId }: FirstDraftsScheduleProps) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <ConnectPlatforms
        brandId={brandId}
        returnTo="/onboarding/brand?step=schedule"
      />
    </div>
  );
}
