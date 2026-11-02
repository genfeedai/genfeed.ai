'use client';

// biome-ignore assist/source/organizeImports: React and external packages precede package imports and path aliases.
import { useCallback, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { PERSONAL_SETTINGS_ANCHOR } from '@/config/personal-settings-anchor';
import { useAuthUser } from '@hooks/auth/use-auth-user/use-auth-user';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { UsersService } from '@services/organization/users.service';
import { useQueryClient } from '@tanstack/react-query';
import Spinner from '@ui/primitives/spinner';
import Card from '@ui/card/Card';
import { Alert } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Switch } from '@ui/primitives/switch';

import ProductEmailPreferences from './product-email-preferences';

const WORKFLOW_EMAIL_KEY = ['users', 'email-preferences', 'workflow'] as const;
const AGENT_EMAIL_KEY = ['users', 'email-preferences', 'agent'] as const;

export default function SettingsNotificationsPage() {
  const translate = useTranslations('common');
  const { isLoaded } = useAuthUser();
  const notifications = NotificationsService.getInstance();
  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);

  // Each preference is cached: coming back to Notifications shows the saved
  // values at once while they refresh, and the toggles show a skeleton, never
  // "off", until the first read lands.
  const workflowPreferenceQuery = useAuthedQuery({
    queryFn: async (service, signal) => {
      try {
        const preference =
          await service.findWorkflowEmailNotificationPreference(signal);
        return preference.isEnabled;
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load workflow email preference', error);
        }
        throw error;
      }
    },
    queryKey: WORKFLOW_EMAIL_KEY,
    service: (token: string) => UsersService.getInstance(token),
  });
  const agentPreferenceQuery = useAuthedQuery({
    queryFn: async (service, signal) => {
      try {
        const preference =
          await service.findAgentEmailNotificationPreference(signal);
        return preference.isEnabled;
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load agent email preference', error);
        }
        throw error;
      }
    },
    queryKey: AGENT_EMAIL_KEY,
    service: (token: string) => UsersService.getInstance(token),
  });
  const isWorkflowNotificationsEmail = workflowPreferenceQuery.data;
  const isAgentNotificationsEmail = agentPreferenceQuery.data;
  const { refetch: refetchWorkflowPreference } = workflowPreferenceQuery;
  const { refetch: refetchAgentPreference } = agentPreferenceQuery;

  const setCachedPreference = useCallback(
    (queryKey: readonly string[], isEnabled: boolean | undefined) => {
      queryClient.setQueriesData<boolean>({ queryKey }, isEnabled);
    },
    [queryClient],
  );

  const handleWorkflowEmailPreferenceChange = useCallback(
    async (isEnabled: boolean) => {
      const previousValue = isWorkflowNotificationsEmail;
      setCachedPreference(WORKFLOW_EMAIL_KEY, isEnabled);
      setIsSaving(true);
      try {
        const service = await getUsersService();
        const preference =
          await service.patchWorkflowEmailNotificationPreference(isEnabled);
        setCachedPreference(WORKFLOW_EMAIL_KEY, preference.isEnabled);
      } catch (error: unknown) {
        logger.error('Failed to update workflow email preference', error);
        setCachedPreference(WORKFLOW_EMAIL_KEY, previousValue);
        notifications.error(
          translate('settings.profile.workflowEmail.saveError'),
        );
      } finally {
        setIsSaving(false);
      }
    },
    [
      getUsersService,
      isWorkflowNotificationsEmail,
      notifications,
      setCachedPreference,
      translate,
    ],
  );

  const handleAgentEmailPreferenceChange = useCallback(
    async (isEnabled: boolean) => {
      const previousValue = isAgentNotificationsEmail;
      setCachedPreference(AGENT_EMAIL_KEY, isEnabled);
      setIsSaving(true);
      try {
        const service = await getUsersService();
        const preference =
          await service.patchAgentEmailNotificationPreference(isEnabled);
        setCachedPreference(AGENT_EMAIL_KEY, preference.isEnabled);
      } catch (error: unknown) {
        logger.error('Failed to update agent email preference', error);
        setCachedPreference(AGENT_EMAIL_KEY, previousValue);
        notifications.error(translate('settings.profile.agentEmail.saveError'));
      } finally {
        setIsSaving(false);
      }
    },
    [
      getUsersService,
      isAgentNotificationsEmail,
      notifications,
      setCachedPreference,
      translate,
    ],
  );

  if (!isLoaded) {
    return (
      <div className="flex min-h-form items-center justify-center">
        <Spinner className="size-8 text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card
        id={PERSONAL_SETTINGS_ANCHOR.EMAIL_NOTIFICATIONS}
        label={translate('settings.profile.workflowEmail.cardTitle')}
      >
        <div className="space-y-3">
          <Switch
            aria-label={translate('settings.profile.workflowEmail.label')}
            label={translate('settings.profile.workflowEmail.label')}
            description={translate(
              'settings.profile.workflowEmail.description',
            )}
            isChecked={isWorkflowNotificationsEmail ?? false}
            isDisabled={isSaving || isWorkflowNotificationsEmail === undefined}
            isLoading={workflowPreferenceQuery.isPending}
            onChange={(e) =>
              handleWorkflowEmailPreferenceChange(e.target.checked)
            }
          />
          {workflowPreferenceQuery.isError ? (
            <Alert variant="warning">
              <div className="flex items-center justify-between gap-3">
                <span>
                  {translate('settings.profile.workflowEmail.loadError')}
                </span>
                <Button
                  label={translate('actions.retry')}
                  onClick={() => void refetchWorkflowPreference()}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                />
              </div>
            </Alert>
          ) : null}
          <Switch
            aria-label={translate('settings.profile.agentEmail.label')}
            label={translate('settings.profile.agentEmail.label')}
            description={translate('settings.profile.agentEmail.description')}
            isChecked={isAgentNotificationsEmail ?? false}
            isDisabled={isSaving || isAgentNotificationsEmail === undefined}
            isLoading={agentPreferenceQuery.isPending}
            onChange={(e) => handleAgentEmailPreferenceChange(e.target.checked)}
          />
          {agentPreferenceQuery.isError ? (
            <Alert variant="warning">
              <div className="flex items-center justify-between gap-3">
                <span>
                  {translate('settings.profile.agentEmail.loadError')}
                </span>
                <Button
                  label={translate('actions.retry')}
                  onClick={() => void refetchAgentPreference()}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                />
              </div>
            </Alert>
          ) : null}
          <ProductEmailPreferences />
        </div>
      </Card>
    </div>
  );
}
