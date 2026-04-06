'use client';

import { ModalEnum } from '@genfeedai/enums';
import type { IOrganizationSetting } from '@genfeedai/interfaces';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { EditSettingModal } from '@protected/organization/components/edit-setting-modal';
import { SettingRow } from '@protected/organization/components/setting-row';
import { useOrganizationSettings } from '@protected/organization/hooks/use-organization-settings';
import CardEmpty from '@ui/card/empty/CardEmpty';
import { SkeletonTable } from '@ui/display/skeleton/skeleton';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Fragment, useCallback, useEffect, useState } from 'react';

interface OrganizationSettingsTableProps {
  settings: IOrganizationSetting | null;
  isLoading: boolean;
  organizationId: string;
  onUpdate: () => void;
}

interface SettingGroup {
  label: string;
  settings: Array<{
    key: keyof IOrganizationSetting;
    label: string;
    type: 'boolean' | 'number' | 'string' | 'array';
  }>;
}

const SETTING_GROUPS: SettingGroup[] = [
  {
    label: 'Features',
    settings: [
      {
        key: 'isGenerateVideosEnabled',
        label: 'Video Generation',
        type: 'boolean',
      },
      {
        key: 'isGenerateArticlesEnabled',
        label: 'Article Generation',
        type: 'boolean',
      },
      {
        key: 'isGenerateImagesEnabled',
        label: 'Image Generation',
        type: 'boolean',
      },
      {
        key: 'isGenerateMusicEnabled',
        label: 'Music Generation',
        type: 'boolean',
      },
      {
        key: 'isAutoEvaluateEnabled',
        label: 'Auto Evaluation',
        type: 'boolean',
      },
    ],
  },
  {
    label: 'Limits',
    settings: [
      { key: 'seatsLimit', label: 'Seats Limit', type: 'number' },
      { key: 'brandsLimit', label: 'Brands Limit', type: 'number' },
    ],
  },
  {
    label: 'Notifications',
    settings: [
      {
        key: 'isNotificationsEmailEnabled',
        label: 'Email Notifications',
        type: 'boolean',
      },
      {
        key: 'isNotificationsDiscordEnabled',
        label: 'Discord Notifications',
        type: 'boolean',
      },
    ],
  },
  {
    label: 'Integrations',
    settings: [
      { key: 'isWhitelabelEnabled', label: 'Whitelabel', type: 'boolean' },
      { key: 'isVoiceControlEnabled', label: 'Voice Control', type: 'boolean' },
      { key: 'isWebhookEnabled', label: 'Webhooks', type: 'boolean' },
      { key: 'webhookEndpoint', label: 'Webhook Endpoint', type: 'string' },
      { key: 'webhookSecret', label: 'Webhook Secret', type: 'string' },
    ],
  },
  {
    label: 'Verification',
    settings: [
      {
        key: 'isVerifyScriptEnabled',
        label: 'Script Verification',
        type: 'boolean',
      },
      {
        key: 'isVerifyIngredientEnabled',
        label: 'Ingredient Verification',
        type: 'boolean',
      },
      {
        key: 'isVerifyVideoEnabled',
        label: 'Video Verification',
        type: 'boolean',
      },
    ],
  },
  {
    label: 'Content',
    settings: [
      { key: 'isWatermarkEnabled', label: 'Watermark', type: 'boolean' },
    ],
  },
  {
    label: 'Configuration',
    settings: [
      { key: 'timezone', label: 'Timezone', type: 'string' },
      { key: 'enabledModels', label: 'Enabled Models', type: 'array' },
    ],
  },
];

interface SelectedSetting {
  key: string;
  label: string;
  value: unknown;
  type: 'boolean' | 'number' | 'string' | 'array';
}

export function OrganizationSettingsTable({
  settings,
  isLoading,
  organizationId,
  onUpdate,
}: OrganizationSettingsTableProps) {
  const { updateSettings } = useOrganizationSettings(organizationId);
  const [selectedSetting, setSelectedSetting] =
    useState<SelectedSetting | null>(null);

  const handleEdit = useCallback((setting: SelectedSetting) => {
    setSelectedSetting(setting);
  }, []);

  const handleUpdate = useCallback(
    async (key: string, value: unknown) => {
      try {
        await updateSettings({ [key]: value } as Partial<IOrganizationSetting>);
        setSelectedSetting(null);
        onUpdate();
      } catch {
        // Errors handled by hook
      }
    },
    [updateSettings, onUpdate],
  );

  const handleSave = useCallback(
    async (value: unknown) => {
      if (!selectedSetting) {
        return;
      }
      await handleUpdate(selectedSetting.key, value);
    },
    [selectedSetting, handleUpdate],
  );

  const handleCancel = useCallback(() => {
    setSelectedSetting(null);
  }, []);

  useEffect(() => {
    if (selectedSetting) {
      setTimeout(() => openModal(ModalEnum.EDIT_SETTING), 0);
    }
  }, [selectedSetting]);

  if (isLoading) {
    return <SkeletonTable rows={10} columns={3} />;
  }

  if (!settings) {
    return <CardEmpty label="No settings found" />;
  }

  return (
    <>
      <WorkspaceSurface
        eyebrow="Organization Controls"
        title="Settings Matrix"
        tone="muted"
        className="overflow-hidden"
        contentClassName="p-0"
        data-testid="organization-settings-surface"
      >
        <div className="overflow-x-auto">
          <table className="table table-zebra w-full">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/40">
                  Setting
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/40">
                  Value
                </th>
                <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/40">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {SETTING_GROUPS.map((group) => (
                <Fragment key={group.label}>
                  <tr key={group.label} className="bg-background/50">
                    <td
                      colSpan={3}
                      className="px-4 py-2 font-semibold text-sm uppercase"
                    >
                      {group.label}
                    </td>
                  </tr>
                  {group.settings.map((setting) => {
                    const value = settings[setting.key];
                    return (
                      <SettingRow
                        key={String(setting.key)}
                        label={setting.label}
                        value={value}
                        type={setting.type}
                        onEdit={() =>
                          handleEdit({
                            key: setting.key,
                            label: setting.label,
                            type: setting.type,
                            value,
                          })
                        }
                      />
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </WorkspaceSurface>
      {selectedSetting && (
        <EditSettingModal
          label={selectedSetting.label}
          value={selectedSetting.value}
          type={selectedSetting.type}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}
