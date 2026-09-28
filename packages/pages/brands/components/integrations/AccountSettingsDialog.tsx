'use client';

import AccountHistoryImportPanel from '@pages/brands/components/integrations/AccountHistoryImportPanel';
import {
  getConnectionLabel,
  hasHistoryImport,
  hasWarmupBlueprint,
} from '@pages/brands/components/integrations/account-connection-status.util';
import CredentialPostingTimesEditor from '@pages/brands/components/sidebar/CredentialPostingTimesEditor';
import SocialWarmupProgram from '@pages/brands/components/sidebar/social-warmup/SocialWarmupProgram';
import type {
  AccountSettingsDialogProps,
  AccountSettingsSection,
  AccountSettingsSectionsProps,
} from '@props/pages/brand-integrations.props';
import Tabs from '@ui/navigation/tabs/Tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives/dialog';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

function AccountSettingsSections({
  brandId,
  connection,
  health,
  onOverrideRequest,
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
    <div className="flex flex-col gap-4">
      {sections.length > 1 ? (
        <Tabs
          activeTab={activeSection}
          ariaLabel={translate('settings')}
          listClassName="mr-auto"
          onTabChange={(id) => setActiveSection(id as AccountSettingsSection)}
          tabs={sections.map((section) => ({
            id: section,
            label: translate(`settingsSections.${section}`),
          }))}
        />
      ) : null}

      {activeSection === 'postingTimes' ? (
        <CredentialPostingTimesEditor
          credentialId={connection.credentialId}
          initialTimes={connection.postingTimes}
        />
      ) : null}
      {activeSection === 'import' ? (
        <AccountHistoryImportPanel brandId={brandId} connection={connection} />
      ) : null}
      {activeSection === 'health' ? (
        <SocialWarmupProgram
          connection={connection}
          health={health}
          onOverrideRequest={onOverrideRequest}
          onReconnect={() => onReconnect(connection)}
        />
      ) : null}
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
        <DialogHeader>
          <DialogTitle>
            {connection
              ? translate('settingsDialogTitle', {
                  account: getConnectionLabel(connection),
                })
              : translate('settings')}
          </DialogTitle>
        </DialogHeader>

        {connection ? (
          <AccountSettingsSections
            key={connection.credentialId}
            connection={connection}
            {...sectionProps}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
