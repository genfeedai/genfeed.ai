'use client';

import type { IDesktopSession } from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { useEffect, useState } from 'react';

interface OnboardingWizardProps {
  onComplete: () => void;
}

export default function OnboardingWizard({
  onComplete,
}: OnboardingWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [isConnecting, setIsConnecting] = useState(false);

  // Subscribe to session changes — when a session arrives, complete onboarding
  useEffect(() => {
    const dispose = window.genfeedDesktop.auth.onDidChangeSession(
      (session: IDesktopSession | null) => {
        if (session) {
          onComplete();
        }
      },
    );
    return dispose;
  }, [onComplete]);

  const handleConnectToCloud = async () => {
    setIsConnecting(true);
    await window.genfeedDesktop.auth.login();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-md rounded-2xl bg-gray-900 p-8 shadow-2xl">
        {step === 1 && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-bold text-white">
                Welcome to Genfeed
              </h1>
              <p className="text-sm text-gray-400">
                Genfeed Desktop keeps your workspace local while generation
                defaults to the Genfeed server. Your account uses Genfeed
                credits, so you do not need Replicate, fal.ai, or other provider
                keys on this machine.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => setStep(2)}
              type="button"
              variant={ButtonVariant.DEFAULT}
            >
              Continue →
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-bold text-white">
                Choose generation access
              </h1>
              <p className="text-sm text-gray-400">
                Connect Genfeed to use server-side generation and paid credits
                by default. You can still add a local or OpenAI-compatible API
                key later if you want to bring your own provider.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Button
                className="w-full"
                disabled={isConnecting}
                onClick={() => void handleConnectToCloud()}
                type="button"
                variant={ButtonVariant.DEFAULT}
              >
                {isConnecting ? 'Connecting...' : 'Use Genfeed credits'}
              </Button>
              <Button
                className="w-full text-gray-400 hover:text-white"
                onClick={onComplete}
                type="button"
                variant={ButtonVariant.UNSTYLED}
              >
                Set up my own local provider instead
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
