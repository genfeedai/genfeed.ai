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
import { useTranslations } from 'next-intl';
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
  const translate = useTranslations('common.agentAuth.claim');
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
              translate('errors.unavailable'),
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
              : translate('errors.unavailable'),
          );
        }
      }
    }

    void loadClaimDetails();
    return () => controller.abort();
  }, [claimAttemptToken, hasValidRequest, isSignedIn, translate]);

  async function completeClaim(): Promise<void> {
    if (!claimAttemptToken || !/^\d{6}$/.test(userCode)) {
      setClaimState({
        error: translate('errors.codeRequired'),
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
        throw new Error(translate('errors.sessionExpired'));
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
            translate('errors.completionFailed'),
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
            : translate('errors.completionFailed'),
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
          <div className="mb-5 inline-flex size-12 items-center justify-center rounded-xl border border-border bg-background-tertiary">
            <KeyRound
              className="size-5 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <h1 className="mb-1.5 text-xl font-semibold tracking-tight text-balance">
            {translate('title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {translate('description')}
          </p>
        </div>

        <Card className="border-transparent shadow-border">
          <CardContent className="space-y-6 p-8">
            {!hasValidRequest ? (
              <div className="space-y-2 text-center">
                <h2 className="font-semibold">{translate('invalid.title')}</h2>
                <p className="text-sm text-muted-foreground">
                  {translate('invalid.description')}
                </p>
              </div>
            ) : !isSignedIn ? (
              <div className="space-y-4 text-center">
                <div className="space-y-2">
                  <h2 className="font-semibold">{translate('signIn.title')}</h2>
                  <p className="text-sm text-muted-foreground">
                    {translate('signIn.description')}
                  </p>
                </div>
                <Button asChild className="w-full" withWrapper={false}>
                  <Link href={loginHref}>{translate('signIn.action')}</Link>
                </Button>
              </div>
            ) : claimState.isComplete || claimDetails?.status === 'claimed' ? (
              <div className="space-y-3 text-center">
                <CircleCheck
                  className="mx-auto size-8 text-success"
                  aria-hidden="true"
                />
                <h2 className="font-semibold">{translate('success.title')}</h2>
                <p className="text-sm text-muted-foreground">
                  {translate('success.description')}
                </p>
              </div>
            ) : claimDetailsError ? (
              <div className="space-y-2 text-center">
                <h2 className="font-semibold">
                  {translate('unavailableTitle')}
                </h2>
                <p className="text-sm text-destructive" role="alert">
                  {claimDetailsError}
                </p>
              </div>
            ) : !claimDetails ? (
              <p className="text-center text-sm text-muted-foreground">
                {translate('loading')}
              </p>
            ) : (
              <>
                <div className="space-y-3 border-b border-border pb-5">
                  <p className="text-sm font-medium">
                    {translate('permissionsTitle')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {claimDetails.requested_scopes.map((scope) => (
                      <span
                        className="rounded-full border border-border bg-background-tertiary px-3 py-1 font-mono text-xs text-muted-foreground"
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
                    {translate('code.label')}
                  </label>
                  <Input
                    autoComplete="one-time-code"
                    id="agent-auth-user-code"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder={translate('code.placeholder')}
                    value={userCode}
                    onChange={(event) =>
                      setUserCode(
                        event.target.value.replace(/\D/g, '').slice(0, 6),
                      )
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {translate('code.help')}
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
                  {claimState.isSubmitting
                    ? translate('actions.authorizing')
                    : translate('actions.authorize')}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <p className="mt-5 text-center text-2xs leading-relaxed text-muted-foreground/50">
          {translate('footer')}
        </p>
      </div>
    </AuthFormLayout>
  );
}
