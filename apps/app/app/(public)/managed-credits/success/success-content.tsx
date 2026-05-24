'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { Code } from '@genfeedai/ui';
import {
  type ManagedCreditsProvisioningResult,
  ManagedCreditsService,
} from '@services/billing/managed-credits.service';
import Spinner from '@ui/feedback/spinner/Spinner';
import AuthFormLayout from '@ui/layouts/auth/AuthFormLayout';
import { Button } from '@ui/primitives/button';
import { useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Suspense, useCallback, useEffect, useState } from 'react';
import {
  HiCheckCircle,
  HiClipboard,
  HiClipboardDocumentCheck,
  HiExclamationTriangle,
  HiKey,
} from 'react-icons/hi2';
import { Card, CardContent } from '@/components/ui/card';

type CopyTarget = 'api-key' | 'env';

interface SuccessState {
  error: string | null;
  isLoading: boolean;
  result: ManagedCreditsProvisioningResult | null;
}

function buildEnvSnippet(apiKey: string): string {
  return [
    `GENFEED_API_KEY=${apiKey}`,
    `GENFEED_MANAGED_INFERENCE_URL=${ManagedCreditsService.apiEndpoint}/managed-inference`,
  ].join('\n');
}

function ManagedCreditsSuccessContentInner() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [state, setState] = useState<SuccessState>({
    error: null,
    isLoading: true,
    result: null,
  });
  const [copiedTarget, setCopiedTarget] = useState<CopyTarget | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setState({
        error: 'Missing Stripe checkout session.',
        isLoading: false,
        result: null,
      });
      return;
    }

    let isMounted = true;

    ManagedCreditsService.getCheckoutResult(sessionId)
      .then((result) => {
        if (isMounted) {
          setState({ error: null, isLoading: false, result });
        }
      })
      .catch((error: unknown) => {
        if (isMounted) {
          setState({
            error:
              error instanceof Error
                ? error.message
                : 'Managed credits checkout result is not ready yet.',
            isLoading: false,
            result: null,
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  const copyValue = useCallback(async (target: CopyTarget, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedTarget(target);
    window.setTimeout(() => setCopiedTarget(null), 2000);
  }, []);

  const apiKey = state.result?.apiKey ?? '';
  const envSnippet = apiKey ? buildEnvSnippet(apiKey) : '';
  const hasRecoverableExistingKey =
    state.result?.apiKeyAlreadyExists && !state.result.apiKey;

  return (
    <AuthFormLayout>
      <div className="mx-auto w-full max-w-xl">
        <div className="mb-8 text-center">
          <div className="mb-5 inline-flex size-12 items-center justify-center rounded-xl border border-white/10 bg-white/5">
            <HiKey className="size-5 text-white/60" />
          </div>
          <h1 className="mb-1.5 text-xl font-semibold tracking-tight">
            Managed credits ready
          </h1>
          <p className="text-sm text-muted-foreground">
            Add the managed key to your self-hosted Genfeed install.
          </p>
        </div>

        <Card className="border-white/[0.08]">
          <CardContent className="p-8">
            {state.isLoading ? (
              <StepDisplay
                icon={<Spinner size={ComponentSize.LG} />}
                title="Provisioning checkout"
                description="Waiting for Stripe to finish credit and key provisioning..."
              />
            ) : null}

            {!state.isLoading && state.error ? (
              <StepDisplay
                icon={
                  <HiExclamationTriangle className="size-8 text-amber-500" />
                }
                title="Provisioning result not ready"
                description={state.error}
              />
            ) : null}

            {!state.isLoading && hasRecoverableExistingKey ? (
              <StepDisplay
                icon={<HiCheckCircle className="size-8 text-emerald-500" />}
                title="Credits added"
                description="This account already has a managed API key, so the secret cannot be shown again. Use your existing key or create a new one in Genfeed Cloud."
              />
            ) : null}

            {!state.isLoading && apiKey ? (
              <div className="space-y-6">
                <StepDisplay
                  icon={<HiCheckCircle className="size-8 text-emerald-500" />}
                  title="Credits added"
                  description={`Provisioned for ${state.result?.email ?? 'your account'}. Copy this key now and store it in your local environment.`}
                />

                <KeyBlock
                  copied={copiedTarget === 'api-key'}
                  label="GENFEED_API_KEY"
                  value={apiKey}
                  onCopy={() => copyValue('api-key', apiKey)}
                />

                <KeyBlock
                  copied={copiedTarget === 'env'}
                  label="Local .env values"
                  value={envSnippet}
                  onCopy={() => copyValue('env', envSnippet)}
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </AuthFormLayout>
  );
}

function KeyBlock({
  copied,
  label,
  onCopy,
  value,
}: {
  copied: boolean;
  label: string;
  onCopy: () => void;
  value: string;
}) {
  return (
    <div className="border-t border-white/[0.08] pt-5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        <Button
          variant={ButtonVariant.SOFT}
          size={ButtonSize.SM}
          onClick={onCopy}
        >
          {copied ? (
            <HiClipboardDocumentCheck className="size-4 text-emerald-500" />
          ) : (
            <HiClipboard className="size-4" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <Code
        display="block"
        size="sm"
        className="max-h-40 whitespace-pre-wrap break-all border border-white/10 text-white/70"
      >
        {value}
      </Code>
    </div>
  );
}

function StepDisplay({
  description,
  icon,
  title,
}: {
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="mb-1">{icon}</div>
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export default function ManagedCreditsSuccessContent() {
  return (
    <Suspense fallback={null}>
      <ManagedCreditsSuccessContentInner />
    </Suspense>
  );
}
