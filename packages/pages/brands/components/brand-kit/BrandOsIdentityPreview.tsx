'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { BrandOsIdentityPreviewProps } from '@genfeedai/props/pages/brand-os-settings.props';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useUserRole } from '@hooks/auth/use-user-role/use-user-role';
import { useBrandIdentityPreview } from '@hooks/ui/generation-receipts/use-brand-identity-preview';
import BrandIdentitySnapshotView from '@ui/components/generation-receipts/BrandIdentitySnapshotView';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

export default function BrandOsIdentityPreview({
  organizationId,
  brandId,
  refreshKey,
  isDisabled,
}: BrandOsIdentityPreviewProps) {
  const t = useTranslations('pages.brandOsSettings.identityPreview');
  const role = useUserRole();
  const { userId, sessionId, orgId, isLoaded, isSignedIn, getToken } =
    useAuthIdentity();
  const context = useMemo(
    () => ({
      organizationId,
      brandId,
      refreshKey,
      isDisabled,
      role,
      userId,
      sessionId,
      orgId,
      isLoaded,
      isSignedIn,
      getToken,
    }),
    [
      organizationId,
      brandId,
      refreshKey,
      isDisabled,
      role,
      userId,
      sessionId,
      orgId,
      isLoaded,
      isSignedIn,
      getToken,
    ],
  );
  const [open, setOpen] = useState({ context, isOpen: false });
  const isOpen = open.context === context && open.isOpen && !isDisabled;
  const state = useBrandIdentityPreview({
    organizationId,
    brandId,
    refreshKey,
    isOpen,
  });
  const errors = {
    unavailable: 'unavailable',
    integrity_failed: 'integrityFailed',
    assets_unavailable: 'assetsUnavailable',
    load_failed: 'loadFailed',
  } as const;
  function close() {
    state.close();
    setOpen({ context, isOpen: false });
  }
  return (
    <section aria-label={t('title')} className="space-y-3">
      <h3 className="text-sm font-semibold">{t('title')}</h3>
      <Button
        size={ButtonSize.SM}
        variant={ButtonVariant.SECONDARY}
        disabled={isDisabled || isOpen || !organizationId || !brandId}
        onClick={() => setOpen({ context, isOpen: true })}
      >
        {t('open')}
      </Button>
      {isDisabled && (
        <p className="text-sm text-muted-foreground">{t('savedVersion')}</p>
      )}
      {isOpen && (
        <>
          <div className="flex gap-2">
            <Button
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              disabled={state.isLoading}
              onClick={state.refresh}
            >
              {t('refresh')}
            </Button>
            <Button
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              onClick={close}
            >
              {t('close')}
            </Button>
          </div>
          {state.isLoading && <p role="status">{t('loading')}</p>}
          {state.error && <p role="alert">{t(errors[state.error])}</p>}
          {state.result && (
            <BrandIdentitySnapshotView
              snapshot={state.result.snapshot}
              source={state.result.source}
              organizationId={organizationId}
              brandId={brandId}
            />
          )}
        </>
      )}
    </section>
  );
}
