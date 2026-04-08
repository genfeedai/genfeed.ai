'use client';

import { useUser } from '@clerk/nextjs';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import type { ISetting } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { User } from '@models/auth/user.model';
import { logger } from '@services/core/logger.service';
import { UsersService } from '@services/organization/users.service';
import Card from '@ui/card/Card';
import { Switch } from '@ui/primitives/switch';
import { useCallback, useState } from 'react';

type ExtendedSettingPatch = Partial<ISetting> & {
  isVideoNotificationsEmail?: boolean;
  isWorkflowNotificationsEmail?: boolean;
};

const settingsToggleClassName =
  'border border-white/8 bg-[rgba(249,115,22,0.14)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] data-[state=checked]:border-[var(--accent-orange)] data-[state=checked]:bg-[var(--accent-orange)] data-[state=unchecked]:hover:bg-[rgba(249,115,22,0.2)]';

export default function SettingsProfilePage() {
  const { user, isLoaded } = useUser();
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
        <span className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const isAdvancedMode = currentUser?.settings?.isAdvancedMode ?? true;
  const isWorkflowNotificationsEmail =
    (currentUser?.settings as ExtendedSettingPatch | undefined)
      ?.isWorkflowNotificationsEmail ?? false;
  const isVideoNotificationsEmail =
    (currentUser?.settings as ExtendedSettingPatch | undefined)
      ?.isVideoNotificationsEmail ?? false;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Profile Information</h2>
        <div className="space-y-4">
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

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Features</h2>
        <Switch
          label="Advanced Mode"
          description="Show studio, workflow editor, automation tools, and individual generation pages. Recommended for power users."
          isChecked={isAdvancedMode}
          isDisabled={isSaving}
          switchClassName={settingsToggleClassName}
          onChange={(e) => patchSettings({ isAdvancedMode: e.target.checked })}
        />
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Email Notifications</h2>
        <div className="space-y-4">
          <Switch
            label="Workflow Emails"
            description="Send an email when a workflow completes or fails."
            isChecked={isWorkflowNotificationsEmail}
            isDisabled={isSaving}
            switchClassName={settingsToggleClassName}
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
            switchClassName={settingsToggleClassName}
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
