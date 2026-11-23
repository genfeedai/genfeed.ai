'use client';

import { clearClientProtectedBootstrapCache } from '@contexts/providers/protected-bootstrap/client-protected-bootstrap';
import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { ICredential } from '@genfeedai/contracts/interfaces';
import type { ConnectionAccount } from '@genfeedai/props/ui/feedback/connection-success.props';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { ServicesService } from '@services/external/services.service';
import ConnectionSuccess from '@ui/feedback/connection-success/ConnectionSuccess';
import { resolvePlatformConnectionBrand } from '@ui/feedback/connection-success/connection-brand';
import { Button } from '@ui/primitives/button';
import Spinner from '@ui/primitives/spinner';
import { CircleX } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import AnalyticsPublicRouteSync from '@/components/analytics/AnalyticsPublicRouteSync';
import FacebookPageSelector from '@/features/auth/components/modals/brands/facebook/FacebookPageSelector';
import GoogleBusinessLocationSelector from '@/features/auth/components/modals/brands/google-business/GoogleBusinessLocationSelector';
import InstagramAccountSelector from '@/features/auth/components/modals/brands/instagram/InstagramAccountSelector';
import type { InstagramAccountSelectorProps } from '@/features/auth/props/instagram-account-selector.props';
import type {
  OAuthPlatformFormContentProps,
  VerifyResult,
} from '@/features/auth/props/oauth-platform-form.props';
import {
  clearOAuthConnectContext,
  HISTORY_IMPORT_CREDENTIAL_QUERY_PARAM,
  OAUTH_RETURN_TO_STORAGE_KEY,
  readOAuthConnectContext,
  redirectToOAuthAuthorization,
} from '@/hooks/auth/use-platform-oauth-connect/oauth-connect-context';
import { resolveSameOriginReturnTo } from '@/lib/navigation/resolve-same-origin-return-to';
import { navigateToReturnPath } from './oauth-return-navigation';
import {
  isHttpsAuthorizationUrl,
  isReportableOAuthVerifyFailure,
  resolveOAuthPlatformVerifyFailure,
} from './oauth-verify-error';
import { useOAuthCallbackLocation } from './use-oauth-callback-location';

const OAUTH1_PLATFORMS = ['x-ads'];

const REDIRECT_DELAY_MS = 3000;
const DEFAULT_RETURN_PATH = APP_ROUTES.CONNECTORS.API_KEYS;

/** Each platform with an ambiguous connection lists its own candidates. */
function AccountSelector({
  platform,
  ...props
}: InstagramAccountSelectorProps & { platform: string }) {
  if (platform === 'google-business') {
    return <GoogleBusinessLocationSelector {...props} />;
  }
  if (platform === 'facebook') {
    return <FacebookPageSelector {...props} />;
  }
  return <InstagramAccountSelector {...props} />;
}

const INITIAL_STATE: VerifyResult = { status: 'loading' };

function OAuthPlatformFormContent({
  platform,
  searchParams,
}: OAuthPlatformFormContentProps) {
  const translate = useTranslations('common.oauth.platformCallback');
  const code = searchParams.get('code');
  const providerError = searchParams.get('error');
  const oauthToken = searchParams.get('oauth_token');
  const oauthVerifier = searchParams.get('oauth_verifier');
  const returnToParam = searchParams.get('return_to');
  const state = searchParams.get('state');
  // Authorization servers that follow RFC 9207 (Bluesky) name themselves here,
  // and the client checks the name before it exchanges the code.
  const issuer = searchParams.get('iss');
  const { isLoaded, isSignedIn } = useAuthIdentity();
  const [result, setResult] = useState<VerifyResult>(INITIAL_STATE);
  const hasVerified = useRef(false);
  const callbackQuery = searchParams.toString();
  const callbackPath = `/oauth/${encodeURIComponent(platform)}${
    callbackQuery ? `?${callbackQuery}` : ''
  }`;
  const loginHref = `/login?callbackUrl=${encodeURIComponent(callbackPath)}`;

  const getServicesService = useAuthedService(
    (token: string) => new ServicesService(platform, token),
  );

  const resolveReturnTo = useCallback(() => {
    if (returnToParam) {
      return resolveSameOriginReturnTo(returnToParam, DEFAULT_RETURN_PATH);
    }
    try {
      return resolveSameOriginReturnTo(
        sessionStorage.getItem(OAUTH_RETURN_TO_STORAGE_KEY),
        DEFAULT_RETURN_PATH,
      );
    } catch {
      return DEFAULT_RETURN_PATH;
    }
  }, [returnToParam]);

  const clearStoredReturnTo = useCallback(() => {
    try {
      sessionStorage.removeItem(OAUTH_RETURN_TO_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  // The operator's account is not among the candidates (or they changed their
  // mind). Nothing is saved: the pending credential stays unconnected, and the
  // stored connect context is dropped so a later visit starts a clean flow.
  const cancelAccountSelection = useCallback(() => {
    const returnTo = resolveReturnTo();
    clearStoredReturnTo();
    clearOAuthConnectContext();
    navigateToReturnPath(returnTo);
  }, [clearStoredReturnTo, resolveReturnTo]);

  const completeSuccess = useCallback(
    (
      account?: ConnectionAccount | null,
      credentials: readonly ICredential[] = [],
    ) => {
      // Resolve before clearing: providers drop query params on redirect, so
      // the stored path is the only return channel, and the delayed navigation below
      // reads it after this frame. Clearing first always fell back to default.
      let returnTo = resolveReturnTo();
      const context = readOAuthConnectContext();
      if (context?.shouldOfferHistoryImport) {
        const returnUrl = new URL(returnTo, window.location.origin);
        returnUrl.searchParams.delete(HISTORY_IMPORT_CREDENTIAL_QUERY_PARAM);
        for (const credential of credentials) {
          if (
            credential.isConnected &&
            credential.brandId === context.brandId &&
            credential.id
          ) {
            returnUrl.searchParams.append(
              HISTORY_IMPORT_CREDENTIAL_QUERY_PARAM,
              credential.id,
            );
          }
        }
        returnTo = resolveSameOriginReturnTo(
          `${returnUrl.pathname}${returnUrl.search}${returnUrl.hash}`,
          DEFAULT_RETURN_PATH,
        );
      }
      setResult({ account, status: 'success' });
      clearStoredReturnTo();
      clearOAuthConnectContext();
      // Every connect entry point (integrations page, agent setup panel, chat
      // connect cards) lands here. Brand context embeds credentials in the
      // protected bootstrap, so the page we return to must not reuse a client
      // snapshot taken before this account existed.
      clearClientProtectedBootstrapCache();

      setTimeout(() => {
        navigateToReturnPath(returnTo);
      }, REDIRECT_DELAY_MS);
    },
    [clearStoredReturnTo, resolveReturnTo],
  );

  const verify = useCallback(
    async (forceRefresh = false) => {
      if (hasVerified.current) {
        return;
      }
      hasVerified.current = true;

      const url = `POST /services/${platform}/verify`;
      let callbackSubmitted = false;

      try {
        const service = await getServicesService(
          forceRefresh ? { forceRefresh: true } : undefined,
        );

        const isOAuth1 = OAUTH1_PLATFORMS.includes(platform);

        const body = isOAuth1
          ? {
              oauthToken,
              oauthVerifier,
            }
          : providerError
            ? {
                error: providerError,
                state,
              }
            : {
                code,
                ...(issuer ? { iss: issuer } : {}),
                state,
              };

        callbackSubmitted = true;
        const credential = await service.postVerify(body);

        // Instagram may resolve the token exchange to more than one eligible
        // professional account with no automatic pick. `needsAccountSelection`
        // is computed server-side (see `computeNeedsAccountSelection`) rather
        // than inferred here from `isConnected` — that column can be false
        // for other reasons that have no operator selection waiting.
        if (credential?.needsAccountSelection) {
          logger.info(`${url} success (account selection required)`);
          setResult({ credentialId: credential.id, status: 'selecting' });
          return;
        }

        logger.info(`${url} success`);
        completeSuccess(
          {
            avatarUrl: credential?.externalAvatar,
            name: credential?.externalName || credential?.externalHandle,
          },
          credential ? [credential] : [],
        );
      } catch (error) {
        logger.error(`${url} failed`, {
          error,
          reportToSentry: isReportableOAuthVerifyFailure(error),
        });
        const failure = resolveOAuthPlatformVerifyFailure({
          callbackSubmitted,
          error,
          platform,
          providerError,
        });
        setResult({
          canRestart: failure.canRestart,
          canRetry: failure.canRetry,
          errorMessage: failure.detail ?? translate(failure.messageKey),
          errorTitle: translate(failure.titleKey),
          status: 'error',
        });
      }
    },
    [
      code,
      completeSuccess,
      getServicesService,
      issuer,
      oauthToken,
      oauthVerifier,
      platform,
      providerError,
      state,
      translate,
    ],
  );

  // use-effect-audit: ignore completes the single-use OAuth handshake once the session is signed in
  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      return;
    }

    void verify();
  }, [isLoaded, isSignedIn, verify]);

  const retry = useCallback(() => {
    hasVerified.current = false;
    setResult(INITIAL_STATE);
    void verify(true);
  }, [verify]);

  const isRestarting = useRef(false);
  const restartAuthorization = useCallback(async () => {
    // The provider code is single-use. Start a new connect instead of verify.
    if (isRestarting.current) {
      return;
    }
    isRestarting.current = true;

    const context = readOAuthConnectContext();
    if (!context) {
      const returnTo = resolveReturnTo();
      clearStoredReturnTo();
      navigateToReturnPath(returnTo);
      return;
    }

    try {
      const service = await getServicesService({ forceRefresh: true });
      const credential = await service.postConnect({
        brandId: context.brandId,
        ...(context.credentialId ? { credentialId: context.credentialId } : {}),
        ...(context.shouldOfferHistoryImport
          ? { isHistoryImportRequested: false }
          : {}),
      });
      if (!isHttpsAuthorizationUrl(credential.url)) {
        throw new Error('Authorization URL missing');
      }

      const opened = redirectToOAuthAuthorization({
        authorizationUrl: credential.url,
        brandId: context.brandId,
        credentialId: credential.id || context.credentialId,
        returnTo: resolveReturnTo(),
        shouldOfferHistoryImport: context.shouldOfferHistoryImport,
      });
      if (!opened) {
        isRestarting.current = false;
      }
    } catch {
      isRestarting.current = false;
      logger.error(`POST /services/${platform}/connect restart failed`);
      setResult({
        canRestart: true,
        canRetry: false,
        errorMessage: translate('error.restartFailed'),
        errorTitle: translate('error.title'),
        status: 'error',
      });
    }
  }, [
    clearStoredReturnTo,
    getServicesService,
    platform,
    resolveReturnTo,
    translate,
  ]);

  const platformLabel = platform.charAt(0).toUpperCase() + platform.slice(1);
  const platformBrand = resolvePlatformConnectionBrand(platform);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md text-center">
        {isSignedIn && result.status === 'selecting' && (
          <AccountSelector
            credentialId={result.credentialId}
            onBack={cancelAccountSelection}
            onConnected={completeSuccess}
            onError={(errorMessage) =>
              logger.error(
                `POST /services/${platform}/verify account selection failed`,
                errorMessage,
              )
            }
            platform={platform}
          />
        )}

        {(!isLoaded || (isSignedIn && result.status === 'loading')) && (
          <div className="space-y-4">
            <div className="mx-auto size-16">
              <Spinner className="size-16 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground">
              {translate('connecting', { platform: platformLabel })}
            </p>
          </div>
        )}

        {isLoaded && !isSignedIn && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">{translate('auth.title')}</h2>
            <p className="text-sm text-muted-foreground">
              {translate('auth.description', { platform: platformLabel })}
            </p>
            <Button asChild withWrapper={false}>
              <Link href={loginHref}>{translate('actions.signIn')}</Link>
            </Button>
          </div>
        )}

        {isSignedIn && result.status === 'success' && (
          <ConnectionSuccess
            account={result.account}
            brand={platformBrand}
            description={translate('success.description')}
            title={translate('success.title', { platform: platformBrand.name })}
          />
        )}

        {isSignedIn && result.status === 'error' && (
          <div className="space-y-4">
            <CircleX className="mx-auto text-5xl text-destructive" />
            <h2 className="text-lg font-semibold">{result.errorTitle}</h2>
            <p className="text-sm text-muted-foreground">
              {result.errorMessage}
            </p>
            <div className="flex justify-center gap-2">
              {result.canRetry && (
                <Button onClick={retry}>{translate('actions.retry')}</Button>
              )}
              {result.canRestart && (
                <Button
                  onClick={() => {
                    void restartAuthorization();
                  }}
                >
                  {translate('actions.restart')}
                </Button>
              )}
              <Button asChild variant={ButtonVariant.LINK} withWrapper={false}>
                <Link href={resolveReturnTo()} onClick={clearStoredReturnTo}>
                  {translate('actions.back')}
                </Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OAuthPlatformPending() {
  const translate = useTranslations('common.oauth.platformCallback');

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md text-center">
        <div className="space-y-4">
          <div className="mx-auto size-16">
            <Spinner className="size-16 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">
            {translate('connectingAccount')}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function OAuthPlatformForm() {
  const location = useOAuthCallbackLocation();

  return (
    <>
      <Suspense fallback={null}>
        <AnalyticsPublicRouteSync />
      </Suspense>
      {location ? (
        <OAuthPlatformFormContent
          platform={location.platform}
          searchParams={location.searchParams}
        />
      ) : (
        <OAuthPlatformPending />
      )}
    </>
  );
}
