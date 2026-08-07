'use client';

import { useCurrentUser } from '@contexts/user/user-context/user-context';
import {
  type AppLocale,
  DEFAULT_LOCALE,
  getSelectableLocales,
  LOCALE_LABELS,
} from '@genfeedai/constants';
import type { ISetting } from '@genfeedai/interfaces';
import { useAuthUser } from '@hooks/auth/use-auth-user/use-auth-user';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { User } from '@models/auth/user.model';
import { logger } from '@services/core/logger.service';
import { UsersService } from '@services/organization/users.service';
import Card from '@ui/card/Card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Switch } from '@ui/primitives/switch';
import { useCallback, useState } from 'react';

type ExtendedSettingPatch = Partial<ISetting> & {
  isVideoNotificationsEmail?: boolean;
  isWorkflowNotificationsEmail?: boolean;
};

// Baked in at module load, matching ServiceWorkerRegistrar. The pseudo-locale is
// a QA instrument, not a language — a customer who lands on accented, padded
// English reasonably reports it as a bug.
const SELECTABLE_LOCALES = getSelectableLocales(
  process.env.NODE_ENV !== 'production',
);

export default function SettingsProfilePage() {
  const { user, isLoaded } = useAuthUser();
  const { currentUser, mutateUser } = useCurrentUser();

  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const [isSaving, setIsSaving] = useState(false);

  const patchSettings = useCallback(
    async (patch: ExtendedSettingPatch) => {
      if (!currentUser) {
        return;
      }

      setIsSaving(true);
      try {
        const service = await getUsersService();
        await service.patchSettings(currentUser.id, patch);
        mutateUser(
          new User({
            ...currentUser,
            settings: { ...currentUser.settings, ...patch },
          }),
        );
      } catch (error) {
        logger.error('Failed to update settings', error);
      } finally {
        setIsSaving(false);
      }
    },
    [currentUser, mutateUser, getUsersService],
  );

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-form">
        <span className="animate-spin size-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const isAdvancedMode = currentUser?.settings?.isAdvancedMode ?? true;
  // A stored locale that is not selectable here (the pseudo-locale in a
  // production build) would leave the trigger blank, so the picker shows the
  // default and offers the way back out.
  const storedLocale = currentUser?.settings?.locale ?? DEFAULT_LOCALE;
  const locale = SELECTABLE_LOCALES.includes(storedLocale)
    ? storedLocale
    : DEFAULT_LOCALE;
  const isWorkflowNotificationsEmail =
    (currentUser?.settings as ExtendedSettingPatch | undefined)
      ?.isWorkflowNotificationsEmail ?? false;
  const isVideoNotificationsEmail =
    (currentUser?.settings as ExtendedSettingPatch | undefined)
      ?.isVideoNotificationsEmail ?? false;

  return (
    <div className="space-y-4">
      <Card label="Profile Information" bodyClassName="gap-3 p-4">
        <div className="space-y-3">
          <div>
            <p className="text-sm text-muted-foreground">Name</p>
            <p className="font-medium">{user?.fullName || 'Not set'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Email</p>
            <p className="font-medium">
              {user?.primaryEmailAddress?.emailAddress || 'Not set'}
            </p>
          </div>
        </div>
      </Card>

      <Card
        label="Language"
        description="The language the app interface is shown in. Content you create is unaffected."
        bodyClassName="gap-3 p-4"
      >
        {/* No cookie write here: `LocaleCookieSync` watches the stored
            preference and owns the cookie plus the single refresh, so the choice
            applies the same way whether it is changed here or on another
            device. */}
        <Select
          disabled={isSaving}
          onValueChange={(value) =>
            patchSettings({ locale: value as AppLocale })
          }
          value={locale}
        >
          <SelectTrigger
            id="personal-locale"
            className="w-full"
            data-testid="personal-locale-trigger"
          >
            <SelectValue placeholder="Select a language" />
          </SelectTrigger>
          <SelectContent>
            {SELECTABLE_LOCALES.map((selectableLocale) => (
              <SelectItem key={selectableLocale} value={selectableLocale}>
                {LOCALE_LABELS[selectableLocale]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      <Card label="Features" bodyClassName="gap-3 p-4">
        <Switch
          label="Advanced Mode"
          description="Show studio, workflow editor, automation tools, and individual generation pages. Recommended for power users."
          isChecked={isAdvancedMode}
          isDisabled={isSaving}
          onChange={(e) => patchSettings({ isAdvancedMode: e.target.checked })}
        />
      </Card>

      <Card label="Email Notifications" bodyClassName="gap-3 p-4">
        <div className="space-y-3">
          <Switch
            label="Workflow Emails"
            description="Send an email when a workflow completes or fails."
            isChecked={isWorkflowNotificationsEmail}
            isDisabled={isSaving}
            onChange={(e) =>
              patchSettings({
                isWorkflowNotificationsEmail: e.target.checked,
              })
            }
          />
          <Switch
            label="Video Emails"
            description="Send an email when a video generation completes or fails."
            isChecked={isVideoNotificationsEmail}
            isDisabled={isSaving}
            onChange={(e) =>
              patchSettings({
                isVideoNotificationsEmail: e.target.checked,
              })
            }
          />
        </div>
      </Card>
    </div>
  );
}
