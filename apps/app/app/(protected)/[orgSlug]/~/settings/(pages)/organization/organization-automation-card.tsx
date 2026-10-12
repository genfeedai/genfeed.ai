'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { MemberRole } from '@genfeedai/contracts';
import { useUserRole } from '@hooks/auth/use-user-role/use-user-role';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import type {
  AutomationSettingField,
  AutomationSettingKey,
} from '@props/settings/organization-automation-card.props';
import { logger } from '@services/core/logger.service';
import Card from '@ui/card/Card';
import { Switch } from '@ui/primitives/switch';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const AUTOMATION_SETTING_FIELDS: AutomationSettingField[] = [
  { key: 'isBreakoutResponsesEnabled', messageKey: 'breakoutResponses' },
  { key: 'isBreakoutAutoPublishEnabled', messageKey: 'breakoutAutoPublish' },
  { key: 'isBrandVisionChecksEnabled', messageKey: 'brandVision' },
];

/**
 * The organization's opt-ins for paid and automatic work (#6526, #6727): breakout responses,
 * breakout auto-publish and brand vision checks. All three are off until an owner or admin
 * turns them on. The API enforces the same role on the settings PATCH; this card only
 * mirrors it so a member sees the state without being offered a switch they cannot use.
 */
export default function OrganizationAutomationCard() {
  const translate = useTranslations('common.settings.organizationAutomation');
  const { organizationId } = useBrand();
  const { isLoading, settings, updateSettings } = useOrganization();
  const role = useUserRole();
  const canManage = role === MemberRole.OWNER || role === MemberRole.ADMIN;
  const [pending, setPending] = useState<AutomationSettingKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isAvailable = Boolean(organizationId && settings && !isLoading);
  const isResponsesEnabled = settings?.isBreakoutResponsesEnabled === true;

  async function change(key: AutomationSettingKey, isEnabled: boolean) {
    if (!canManage || !isAvailable || pending) return;
    setPending(key);
    setError(null);
    setNotice(null);
    try {
      await updateSettings(key, isEnabled);
      setNotice(translate('saved'));
    } catch (failure: unknown) {
      logger.error(
        'Failed to update organization automation settings',
        failure,
      );
      setError(translate('saveFailed'));
    } finally {
      setPending(null);
    }
  }

  return (
    <Card
      label={translate('title')}
      description={translate('description')}
      bodyClassName="gap-3 p-4"
    >
      {!canManage ? (
        <p className="text-xs text-muted-foreground">
          {translate('adminOnly')}
        </p>
      ) : null}
      <div aria-busy={Boolean(pending)} className="divide-y divide-border">
        {AUTOMATION_SETTING_FIELDS.map((field) => {
          const label = translate(`${field.messageKey}.label`);
          const isAutoPublishWaiting =
            field.key === 'isBreakoutAutoPublishEnabled' && !isResponsesEnabled;
          return (
            <div className="py-3 first:pt-0 last:pb-0" key={field.key}>
              <Switch
                aria-label={label}
                description={translate(`${field.messageKey}.description`)}
                isChecked={settings?.[field.key] === true}
                isDisabled={
                  !canManage ||
                  !isAvailable ||
                  Boolean(pending) ||
                  isAutoPublishWaiting
                }
                label={label}
                onCheckedChange={(isEnabled) => {
                  void change(field.key, isEnabled);
                }}
              />
              {isAutoPublishWaiting ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {translate('breakoutAutoPublish.requiresResponses')}
                </p>
              ) : null}
              {field.key === 'isBrandVisionChecksEnabled' ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {translate('brandVision.cost')}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      {isLoading ? (
        <p role="status" className="text-xs text-muted-foreground">
          {translate('loading')}
        </p>
      ) : null}
      {pending ? (
        <p role="status" className="text-xs text-muted-foreground">
          {translate('saving')}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
    </Card>
  );
}
