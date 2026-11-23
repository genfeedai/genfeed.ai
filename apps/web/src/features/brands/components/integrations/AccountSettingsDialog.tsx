'use client';

import type {
  AccountSettingsDialogProps,
  AccountSettingsSection,
  AccountSettingsSectionsProps,
} from '@props/pages/brand-integrations.props';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { Tabs } from '@ui/primitives/tabs';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import AccountHistoryImportPanel from '@/features/brands/components/integrations/AccountHistoryImportPanel';
import {
  getConnectionLabel,
  hasHistoryImport,
  hasWarmupBlueprint,
} from '@/features/brands/components/integrations/account-connection-status.util';
import CredentialPostingTimesEditor from '@/features/brands/components/sidebar/CredentialPostingTimesEditor';
import SocialWarmupProgram from '@/features/brands/components/sidebar/social-warmup/SocialWarmupProgram';

function AccountSettingsSections({
  brandId,
  connection,
  health,
  onReconnect,
}: AccountSettingsSectionsProps) {
  const translate = useTranslations('pages.brandSocialMedia');
  const sections: AccountSettingsSection[] = [
    'postingTimes',
    ...(hasHistoryImport(connection.platform)
      ? (['import'] as const)
      : ([] as const)),
    ...(hasWarmupBlueprint(connection.platform)
      ? (['health'] as const)
      : ([] as const)),
  ];
  const [activeSection, setActiveSection] =
    useState<AccountSettingsSection>('postingTimes');

  return (
    <div className="flex min-h-0 flex-col gap-4">
      {sections.length > 1 ? (
        <Tabs
          activeTab={activeSection}
          ariaLabel={translate('settings')}
          listClassName="mr-auto shrink-0"
          onTabChange={(id) => setActiveSection(id as AccountSettingsSection)}
          tabs={sections.map((section) => ({
            id: section,
            label: translate(`settingsSections.${section}`),
          }))}
        />
      ) : null}

      <div className="min-h-0 overflow-y-auto">
        {activeSection === 'postingTimes' ? (
          <CredentialPostingTimesEditor
            credentialId={connection.credentialId}
            initialTimes={connection.postingTimes}
          />
        ) : null}
        {activeSection === 'import' ? (
          <AccountHistoryImportPanel
            brandId={brandId}
            connection={connection}
          />
        ) : null}
        {activeSection === 'health' ? (
          <SocialWarmupProgram
            connection={connection}
            health={health}
            onReconnect={() => onReconnect(connection)}
          />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Everything configurable for one connected account, opened from its row
 * menu: posting times, the import of its existing posts, and warm-up health
 * where the platform has a warm-up program.
 */
export default function AccountSettingsDialog({
  connection,
  onOpenChange,
  ...sectionProps
}: AccountSettingsDialogProps) {
  const translate = useTranslations('pages.brandSocialMedia');

  return (
    <Dialog open={Boolean(connection)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {connection
              ? translate('settingsDialogTitle', {
                  account: getConnectionLabel(connection),
                })
              : translate('settings')}
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {connection ? (
            <AccountSettingsSections
              key={connection.credentialId}
              connection={connection}
              {...sectionProps}
            />
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
