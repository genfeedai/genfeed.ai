'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';

type Props = {
  error: string | null;
  onContinueSelfServe: () => void;
};

export default function ProactiveErrorState({
  error,
  onContinueSelfServe,
}: Props) {
  return (
    <div className="max-w-3xl">
      <Card
        bodyClassName="gap-0 p-8"
        className="rounded-3xl border-white/10 bg-white/[0.03]"
      >
        <p className="text-sm uppercase tracking-[0.24em] text-white/35">
          Proactive Onboarding
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white">
          Your workspace is almost ready.
        </h1>
        <p className="mt-4 max-w-xl text-white/55">
          {error ?? 'Please refresh in a moment or use the fallback path.'}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.SM}
            label="Continue self-serve"
            onClick={onContinueSelfServe}
          />
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            label="Book a call"
            onClick={() => {
              window.location.href = EnvironmentService.calendly;
            }}
          />
        </div>
      </Card>
    </div>
  );
}
