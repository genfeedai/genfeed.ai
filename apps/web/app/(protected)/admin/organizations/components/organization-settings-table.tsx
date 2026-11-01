import { ModalEnum } from '@genfeedai/contracts';
import type { IOrganizationSetting } from '@genfeedai/contracts/interfaces';
import { openModal } from '@helpers/ui/modal/modal.helper';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import { EditSettingModal } from '@protected/organizations/components/edit-setting-modal';
import { useOrganizationSettings } from '@protected/organizations/hooks/use-organization-settings';
import Table from '@ui/display/table/Table';
import { EmptyStateCard } from '@ui/primitives/empty-state';
import { Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { WorkspaceSurface } from '@/components/overview/WorkspaceSurface';
import type {
  OrganizationSettingsTableProps,
  SelectedSetting,
  SettingGroup,
  SettingTableRow,
} from '@/features/admin/props/organization-settings.props';

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
      {
        key: 'isNotificationsTelegramEnabled',
        label: 'Telegram Notifications',
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
      { key: 'enabledModelIds', label: 'Enabled Models', type: 'array' },
    ],
  },
];

export function OrganizationSettingsTable({
  settings,
  isLoading,
  organizationId,
  onUpdate,
}: OrganizationSettingsTableProps) {
  const translate = useTranslations('pages.adminOrganizationReleases');
  const { updateSettings } = useOrganizationSettings(organizationId);
  const formatValue = useCallback(
    (value: unknown, type: SettingTableRow['type']): string => {
      if (value === null || value === undefined) {
        return translate('settingsTable.notSet');
      }

      switch (type) {
        case 'boolean':
          return translate(value ? 'settingsTable.yes' : 'settingsTable.no');
        case 'array': {
          const count = (value as unknown[]).length;
          return count === 0
            ? translate('settingsTable.none')
            : translate('settingsTable.items', { count });
        }
        default:
          return String(value);
      }
    },
    [translate],
  );
  const columns = useMemo<TableColumn<SettingTableRow>[]>(
    () => [
      { header: translate('settingsTable.column.setting'), key: 'label' },
      {
        className: 'font-mono text-sm',
        header: translate('settingsTable.column.value'),
        key: 'value',
        render: (row) => formatValue(row.value, row.type),
      },
    ],
    [formatValue, translate],
  );
  // Releases sit right after Features, so the order matches the admin's flow.
  const settingGroups = useMemo<SettingGroup[]>(
    () => [
      SETTING_GROUPS[0],
      {
        label: translate('title'),
        settings: [
          {
            key: 'isReleasePreviewEnabled',
            label: translate('previewLabel'),
            type: 'boolean',
          },
        ],
      },
      ...SETTING_GROUPS.slice(1),
    ],
    [translate],
  );
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
      const timer = window.setTimeout(
        () => openModal(ModalEnum.EDIT_SETTING),
        0,
      );
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [selectedSetting]);

  const rows = useMemo<SettingTableRow[]>(
    () =>
      settings
        ? settingGroups.flatMap((group) =>
            group.settings.map((setting) => ({
              group: group.label,
              key: setting.key,
              label: setting.label,
              type: setting.type,
              value: settings[setting.key],
            })),
          )
        : [],
    [settingGroups, settings],
  );

  const actions = useMemo<TableAction<SettingTableRow>[]>(
    () => [
      {
        ariaLabel: (row) =>
          translate('settingsTable.editSetting', { label: row.label }),
        icon: <Pencil className="size-3.5" />,
        onClick: (row) =>
          handleEdit({
            key: row.key,
            label: row.label,
            type: row.type,
            value: row.value,
          }),
        tooltip: translate('settingsTable.edit'),
        tooltipPosition: 'left',
      },
    ],
    [handleEdit, translate],
  );

  if (!isLoading && !settings) {
    return <EmptyStateCard title="No settings found" />;
  }

  return (
    <>
      <WorkspaceSurface
        eyebrow="Organization Controls"
        title="Settings Matrix"
        tone="muted"
        flush
        data-testid="organization-settings-surface"
      >
        <Table<SettingTableRow>
          actions={actions}
          ariaLabel="Organization settings"
          columns={columns}
          framed={false}
          getGroupHeading={(row) => ({ content: row.group, key: row.group })}
          getRowKey={(row) => String(row.key)}
          isLoading={isLoading}
          items={rows}
        />
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
