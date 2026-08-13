'use client';

import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { EnvironmentService } from '@services/core/environment.service';
import AuthFormLayout from '@ui/layouts/auth/AuthFormLayout';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { CircleCheck, KeyRound } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Card, CardContent } from '@/components/ui/card';

type ClaimResponse = {
  detail?: string;
  error?: string;
  error_description?: string;
  message?: string;
  status?: string;
};

type ClaimDetails = {
  expires_at: string;
  requested_scopes: string[];
  status: 'claimed' | 'pending';
};

type ClaimState = {
  error: string | null;
  isComplete: boolean;
  isSubmitting: boolean;
};

export default function AgentAuthClaimContent() {
  const searchParams = useSearchParams();
  const { getToken, isLoaded, isSignedIn } = useAuthIdentity();
  const controllerRef = useRef<AbortController | null>(null);
  const [userCode, setUserCode] = useState('');
  const [claimDetails, setClaimDetails] = useState<ClaimDetails | null>(null);
  const [claimDetailsError, setClaimDetailsError] = useState<string | null>(
    null,
  );
  const [claimState, setClaimState] = useState<ClaimState>({
    error: null,
    isComplete: false,
    isSubmitting: false,
  });
  const claimAttemptToken = searchParams.get('claim_attempt_token');
  const callbackPath = claimAttemptToken
    ? `/agent-auth/claim?claim_attempt_token=${encodeURIComponent(claimAttemptToken)}`
    : '/agent-auth/claim';
  const loginHref = `/login?callbackUrl=${encodeURIComponent(callbackPath)}`;
  const hasValidRequest = Boolean(
    claimAttemptToken && claimAttemptToken.length >= 32,
  );

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!isSignedIn || !hasValidRequest || !claimAttemptToken) {
      return;
    }

    const controller = new AbortController();
    setClaimDetails(null);
    setClaimDetailsError(null);

    async function loadClaimDetails(): Promise<void> {
      try {
        const response = await fetch(
          `${EnvironmentService.apiEndpoint}/agent/auth/claim/inspect`,
          {
            body: JSON.stringify({
              claim_attempt_token: claimAttemptToken,
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
            signal: controller.signal,
          },
        );
        const data = (await response.json()) as ClaimDetails & ClaimResponse;
        if (!response.ok || !Array.isArray(data.requested_scopes)) {
          throw new Error(
            data.error_description ||
              data.detail ||
              data.message ||
              data.error ||
              'This claim request is unavailable.',
          );
        }
        if (!controller.signal.aborted) {
          setClaimDetails(data);
        }
      } catch (error: unknown) {
        if (!controller.signal.aborted) {
          setClaimDetailsError(
            error instanceof Error
              ? error.message
              : 'This claim request is unavailable.',
          );
        }
      }
    }

    void loadClaimDetails();
    return () => controller.abort();
  }, [claimAttemptToken, hasValidRequest, isSignedIn]);

  async function completeClaim(): Promise<void> {
    if (!claimAttemptToken || !/^\d{6}$/.test(userCode)) {
      setClaimState({
        error: 'Enter the six-digit code supplied by your agent.',
        isComplete: false,
        isSubmitting: false,
      });
      return;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setClaimState({
      error: null,
      isComplete: false,
      isSubmitting: true,
    });

    try {
      const token = await resolveAuthToken(getToken);
      if (!token) {
        throw new Error('Your session expired. Sign in and try again.');
      }

      const response = await fetch(
        `${EnvironmentService.apiEndpoint}/agent/auth/claim/complete`,
        {
          body: JSON.stringify({
            claim_attempt_token: claimAttemptToken,
            user_code: userCode,
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          signal: controller.signal,
        },
      );
      const data = (await response.json()) as ClaimResponse;
      if (!response.ok || data.status !== 'claimed') {
        throw new Error(
          data.error_description ||
            data.detail ||
            data.message ||
            data.error ||
            'The agent authorization could not be completed.',
        );
      }

      setClaimState({ error: null, isComplete: true, isSubmitting: false });
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        return;
      }
      setClaimState({
        error:
          error instanceof Error
            ? error.message
            : 'The agent authorization could not be completed.',
        isComplete: false,
        isSubmitting: false,
      });
    }
  }

  if (!isLoaded) {
    return <AuthFormLayout logoSize="compact">{null}</AuthFormLayout>;
  }

  return (
    <AuthFormLayout>
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-5 inline-flex size-12 items-center justify-center rounded-xl border border-white/10 bg-white/5">
            <KeyRound className="size-5 text-white/60" aria-hidden="true" />
          </div>
          <h1 className="mb-1.5 text-xl font-semibold tracking-tight">
            Authorize an agent
          </h1>
          <p className="text-sm text-muted-foreground">
            Confirm that an agent may receive a scoped Genfeed API key for your
            account.
          </p>
        </div>

        <Card className="border-transparent shadow-border">
          <CardContent className="space-y-6 p-8">
            {!hasValidRequest ? (
              <div className="space-y-2 text-center">
                <h2 className="font-semibold">Invalid claim link</h2>
                <p className="text-sm text-muted-foreground">
                  Restart registration from your agent to get a fresh link.
                </p>
              </div>
            ) : !isSignedIn ? (
              <div className="space-y-4 text-center">
                <div className="space-y-2">
                  <h2 className="font-semibold">Sign in required</h2>
                  <p className="text-sm text-muted-foreground">
                    Sign in with the same verified email the agent registered.
                  </p>
                </div>
                <Button asChild className="w-full" withWrapper={false}>
                  <Link href={loginHref}>Sign in to continue</Link>
                </Button>
              </div>
            ) : claimState.isComplete || claimDetails?.status === 'claimed' ? (
              <div className="space-y-3 text-center">
                <CircleCheck
                  className="mx-auto size-8 text-success"
                  aria-hidden="true"
                />
                <h2 className="font-semibold">Agent authorized</h2>
                <p className="text-sm text-muted-foreground">
                  Return to your agent. It can now finish the exchange and will
                  receive the API key once.
                </p>
              </div>
            ) : claimDetailsError ? (
              <div className="space-y-2 text-center">
                <h2 className="font-semibold">Claim unavailable</h2>
                <p className="text-sm text-destructive" role="alert">
                  {claimDetailsError}
                </p>
              </div>
            ) : !claimDetails ? (
              <p className="text-center text-sm text-muted-foreground">
                Loading authorization request…
              </p>
            ) : (
              <>
                <div className="space-y-3 border-b border-white/[0.08] pb-5">
                  <p className="text-sm font-medium">
                    This agent will receive access to
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {claimDetails.requested_scopes.map((scope) => (
                      <span
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs text-muted-foreground"
                        key={scope}
                      >
                        {scope}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    className="text-sm font-medium"
                    htmlFor="agent-auth-user-code"
                  >
                    Six-digit code
                  </label>
                  <Input
                    autoComplete="one-time-code"
                    id="agent-auth-user-code"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={userCode}
                    onChange={(event) =>
                      setUserCode(
                        event.target.value.replace(/\D/g, '').slice(0, 6),
                      )
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the code shown by the agent that opened this request.
                  </p>
                </div>

                {claimState.error ? (
                  <p className="text-sm text-destructive" role="alert">
                    {claimState.error}
                  </p>
                ) : null}

                <Button
                  className="w-full"
                  disabled={claimState.isSubmitting || userCode.length !== 6}
                  onClick={() => void completeClaim()}
                >
                  {claimState.isSubmitting ? 'Authorizing…' : 'Authorize agent'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground/50">
          The credential is scoped, expires after 30 days, and can be revoked
          without exposing your password or browser session.
        </p>
      </div>
    </AuthFormLayout>
  );
}
