'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { LayoutProps } from '@props/layout/layout.props';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import { Button } from '@ui/primitives/button';
import { CircleCheck, RefreshCw, Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import PlatformSettingsProvider, {
  usePlatformSettings,
} from './platform-settings.provider';

function PlatformSettingsShell({ children }: LayoutProps) {
  const { isLoading, isRefreshing, isSaving, refresh, save } =
    usePlatformSettings();
  const translate = useTranslations('pages.platformSettings');

  return (
    <AdminPageShell
      title={translate('title')}
      icon={Settings}
      onRefresh={() => {
        void refresh();
      }}
      isRefreshing={isRefreshing}
      primaryAction={
        <Button
          variant={ButtonVariant.DEFAULT}
          isDisabled={isLoading || isSaving}
          onClick={() => {
            void save();
          }}
        >
          {isSaving ? <RefreshCw className="animate-spin" /> : <CircleCheck />}
          {translate(isSaving ? 'savingButton' : 'saveButton')}
        </Button>
      }
    >
      {children}
    </AdminPageShell>
  );
}

export default function PlatformSettingsLayout({ children }: LayoutProps) {
  return (
    <PlatformSettingsProvider>
      <PlatformSettingsShell>{children}</PlatformSettingsShell>
    </PlatformSettingsProvider>
  );
}
