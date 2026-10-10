'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  APP_ROUTES,
  resolveOrganizationModulePresentationAccess,
} from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import type { OrganizationModulePreferenceGateProps } from '@genfeedai/props/guards/organization-module-preference-gate.props';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

/** Creation views only; saved-data views remain mounted. Server admission still authorizes every write. */
export default function OrganizationModulePreferenceGate(
  props: OrganizationModulePreferenceGateProps,
) {
  const { organizationId } = useBrand();
  return <OrganizationModulePreferenceBody key={organizationId} {...props} />;
}

function OrganizationModulePreferenceBody({
  moduleId,
  children,
}: OrganizationModulePreferenceGateProps) {
  const { organizationId, settings, settingsLoading, refreshSettings } =
    useBrand();
  const { orgHref } = useOrgUrl();
  const t = useTranslations('common.settings.organizationModules');
  const access = resolveOrganizationModulePresentationAccess(
    settingsLoading ? null : settings,
    moduleId,
  );
  const mounted = useRef(true);
  const retrying = useRef(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [hasRetryFailed, setHasRetryFailed] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  async function retry() {
    if (!organizationId || retrying.current || settingsLoading) return;
    retrying.current = true;
    setIsRetrying(true);
    setHasRetryFailed(false);
    try {
      await refreshSettings();
    } catch {
      if (mounted.current) setHasRetryFailed(true);
    } finally {
      retrying.current = false;
      if (mounted.current) setIsRetrying(false);
    }
  }
  if (organizationId && access.isAllowed) return <>{children}</>;
  const isUnavailable = !organizationId || access.reason === 'unavailable';
  const isSubscriptionRequired = access.reason === 'subscription-required';
  // #5502 nothing in the organization can release a founder-only module.
  const isUnreleased = access.reason === 'unreleased';
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p role="status" className="max-w-lg text-sm text-muted-foreground">
        {settingsLoading
          ? t('loading')
          : isUnavailable
            ? t('unavailable')
            : isSubscriptionRequired
              ? t('subscriptionTitle', {
                  module: t(`modules.${moduleId}.label`),
                })
              : isUnreleased
                ? t('unreleasedTitle', {
                    module: t(`modules.${moduleId}.label`),
                  })
                : t('disabledTitle', {
                    module: t(`modules.${moduleId}.label`),
                  })}
      </p>
      {!isUnavailable && (
        <p className="max-w-lg text-sm text-muted-foreground">
          {t(
            isSubscriptionRequired
              ? 'subscriptionHelp'
              : isUnreleased
                ? 'unreleasedHelp'
                : 'disabledHelp',
          )}
        </p>
      )}
      {hasRetryFailed && (
        <p role="alert" className="text-sm text-destructive">
          {t('loadFailed')}
        </p>
      )}
      {isUnavailable ? (
        <Button
          isDisabled={!organizationId || settingsLoading || isRetrying}
          onClick={() => void retry()}
        >
          {t('retry')}
        </Button>
      ) : isUnreleased ? null : (
        <Button asChild>
          <Link
            href={orgHref(
              isSubscriptionRequired
                ? APP_ROUTES.SETTINGS.SUBSCRIPTION
                : APP_ROUTES.SETTINGS.GENERAL,
            )}
          >
            {t(isSubscriptionRequired ? 'manageSubscription' : 'manageModules')}
          </Link>
        </Button>
      )}
    </div>
  );
}
