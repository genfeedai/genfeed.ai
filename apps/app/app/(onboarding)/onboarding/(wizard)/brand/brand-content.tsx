'use client';
import { useOnboarding } from '@contexts/onboarding/onboarding-context';
import {
  type BrandContextType,
  useBrand,
} from '@contexts/user/brand-context/brand-context';
import { getBrandOrganizationId } from '@contexts/user/brand-context/brand-context.helpers';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { isDesktopClient } from '@genfeedai/config/deployment';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IOnboardingContextValue } from '@genfeedai/contracts/interfaces';
import { resolveSignupBrandDomain } from '@genfeedai/helpers';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import type {
  BrandGuideExitEpoch,
  BrandGuideScope,
} from '@genfeedai/props/onboarding/brand-guide.props';
import { resolveAuthToken } from '@helpers/auth/auth.helper';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { UsersService } from '@services/organization/users.service';
import { Button } from '@ui/primitives/button';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ONBOARDING_STORAGE_KEYS } from '@/lib/onboarding/onboarding-access.util';
import BrandGuidePanel from './brand-guide-panel';

function authorizedScope(context: BrandContextType): BrandGuideScope | null {
  const {
    brandId,
    organizationId,
    selectedBrand,
    brands,
    isBrandScopeResolved,
  } = context;
  if (
    !isBrandScopeResolved ||
    !brandId ||
    !organizationId ||
    !selectedBrand ||
    selectedBrand.isDeleted ||
    selectedBrand.id !== brandId ||
    getBrandOrganizationId(selectedBrand) !== organizationId
  )
    return null;
  return brands.some(
    (brand) =>
      !brand.isDeleted &&
      brand.id === brandId &&
      getBrandOrganizationId(brand) === organizationId,
  )
    ? { brandId, organizationId }
    : null;
}
function useGuideExit(
  scope: BrandGuideScope | null,
  userId: string,
  handleStepComplete: IOnboardingContextValue['handleStepComplete'],
) {
  const { getToken } = useAuthIdentity();
  const { push } = useRouter();
  const t = useTranslations('pages.onboarding.brand');
  const [isExiting, setIsExiting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const scopeKey = scope
    ? JSON.stringify([scope.organizationId, scope.brandId])
    : '';
  const live = useRef<BrandGuideExitEpoch>({
    scopeKey,
    userId,
    version: 0,
    mounted: true,
    exiting: false,
  });
  if (live.current.scopeKey !== scopeKey || live.current.userId !== userId) {
    live.current = {
      ...live.current,
      scopeKey,
      userId,
      version: live.current.version + 1,
      exiting: false,
    };
  }
  useEffect(() => {
    live.current.mounted = true;
    return () => {
      live.current.mounted = false;
    };
  }, []);
  useEffect(() => {
    if (live.current.scopeKey === scopeKey && live.current.userId === userId) {
      setIsExiting(false);
      setErrorMessage(null);
    }
  }, [scopeKey, userId]);
  async function exit(skip: boolean) {
    if (live.current.exiting || (!skip && (!scope || !userId))) return;
    const version = live.current.version;
    const shouldContinue = () =>
      live.current.mounted &&
      live.current.version === version &&
      live.current.scopeKey === scopeKey &&
      live.current.userId === userId;
    live.current.exiting = true;
    setIsExiting(true);
    setErrorMessage(null);
    try {
      if (!skip) {
        await handleStepComplete('brand', undefined, shouldContinue);
        return;
      }
      const token = await resolveAuthToken(getToken);
      if (!shouldContinue()) return;
      if (!token && isDesktopClient()) {
        push(APP_ROUTES.DESKTOP.LOCAL);
        return;
      }
      if (!token || !userId) throw new Error('Authentication is unavailable');
      if (scope) {
        await OrganizationsService.getInstance(token).patchSettings(
          scope.organizationId,
          { isFirstLogin: false },
        );
      }
      if (!shouldContinue()) return;
      await UsersService.getInstance(token).patchMe({
        isOnboardingCompleted: true,
      });
      if (shouldContinue()) push('/');
    } catch (error) {
      if (!shouldContinue()) return;
      logger.error('Failed to exit brand onboarding', error);
      setErrorMessage(t(skip ? 'errors.skip' : 'errors.continue'));
    } finally {
      if (shouldContinue()) {
        live.current.exiting = false;
        setIsExiting(false);
      }
    }
  }
  return {
    isExiting,
    errorMessage,
    onContinue: () => {
      void exit(false);
    },
    onSkip: () => {
      void exit(true);
    },
  };
}
function BrandContentContent() {
  const context = useBrand();
  const { currentUser, isLoading } = useCurrentUser();
  const { handleStepComplete } = useOnboarding();
  const t = useTranslations('pages.onboarding.brand');
  const searchParams = useSearchParams();
  const scope = currentUser?.id ? authorizedScope(context) : null;
  const exits = useGuideExit(scope, currentUser?.id ?? '', handleStepComplete);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const suggestionBrand = useRef('');
  const websites = useRef(new Map<string, string>());
  useEffect(() => {
    if (!scope || isLoading || suggestionBrand.current === scope.brandId)
      return;
    suggestionBrand.current = scope.brandId;
    if (websites.current.has(scope.brandId)) {
      setWebsiteUrl(websites.current.get(scope.brandId) ?? '');
      return;
    }
    const resolved = resolveSignupBrandDomain({
      email: currentUser?.email,
      requestedDomain:
        searchParams.get('brandDomain') ??
        localStorage.getItem(ONBOARDING_STORAGE_KEYS.brandDomain),
    });
    websites.current.set(scope.brandId, resolved.websiteUrl ?? '');
    setWebsiteUrl(resolved.websiteUrl ?? '');
  }, [scope, isLoading, currentUser?.email, searchParams]);
  const brandId = scope?.brandId ?? '';
  const changeWebsite = useCallback(
    (value: string) => {
      websites.current.set(brandId, value);
      setWebsiteUrl(value);
    },
    [brandId],
  );
  if (!context.isBrandScopeResolved || isLoading) return null;
  if (!scope)
    return (
      <div className="space-y-4">
        <p role="alert">{exits.errorMessage ?? t('errors.continue')}</p>
        <Button label={t('actions.continue')} isDisabled />
        <Button
          label={t('actions.skip')}
          isDisabled={exits.isExiting}
          onClick={exits.onSkip}
        />
      </div>
    );
  return (
    <BrandGuidePanel
      key={scope.brandId}
      brandId={scope.brandId}
      websiteUrl={websiteUrl}
      onWebsiteUrlChange={changeWebsite}
      onRefreshBrand={context.refreshBrands}
      {...exits}
    />
  );
}
export default function BrandContent() {
  return (
    <Suspense fallback={null}>
      <BrandContentContent />
    </Suspense>
  );
}
