'use client';

// biome-ignore assist/source/organizeImports: React and external packages precede package imports and path aliases.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { ISetting } from '@genfeedai/contracts/interfaces';
import { PERSONAL_SETTINGS_ANCHOR } from '@app-config/personal-settings-anchor';
import { useCurrentUser } from '@contexts/user/user-context/user-context';
import { useAuthUser } from '@hooks/auth/use-auth-user/use-auth-user';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { User } from '@models/auth/user.model';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { UsersService } from '@services/organization/users.service';
import Card from '@ui/card/Card';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import { Switch } from '@ui/primitives/switch';

type PreferenceLoadState = 'error' | 'loading' | 'ready';

export default function SettingsNotificationsPage() {
  const translate = useTranslations('common');
  const { isLoaded } = useAuthUser();
  const { currentUser, mutateUser } = useCurrentUser();
  const notifications = NotificationsService.getInstance();
  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isWorkflowNotificationsEmail, setIsWorkflowNotificationsEmail] =
    useState(false);
  const [workflowPreferenceLoadState, setWorkflowPreferenceLoadState] =
    useState<PreferenceLoadState>('loading');
  const [workflowPreferenceLoadRequest, setWorkflowPreferenceLoadRequest] =
    useState(0);

  const loadWorkflowPreference = useCallback(
    async (signal: AbortSignal) => {
      setWorkflowPreferenceLoadState('loading');

      try {
        const service = await getUsersService();
        const preference =
          await service.findWorkflowEmailNotificationPreference(signal);
        signal.throwIfAborted();
        setIsWorkflowNotificationsEmail(preference.isEnabled);
        setWorkflowPreferenceLoadState('ready');
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        logger.error('Failed to load workflow email preference', error);
        setWorkflowPreferenceLoadState('error');
      }
    },
    [getUsersService],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: workflowPreferenceLoadRequest intentionally re-runs the abortable load after a manual retry
  useEffect(() => {
    const controller = new AbortController();
    void loadWorkflowPreference(controller.signal);
    return () => controller.abort();
  }, [loadWorkflowPreference, workflowPreferenceLoadRequest]);

  const [isAgentNotificationsEmail, setIsAgentNotificationsEmail] =
    useState(false);
  const [agentPreferenceLoadState, setAgentPreferenceLoadState] =
    useState<PreferenceLoadState>('loading');
  const agentPreferenceController = useRef<AbortController | null>(null);

  const loadAgentPreference = useCallback(
    async (signal: AbortSignal) => {
      setAgentPreferenceLoadState('loading');

      try {
        const service = await getUsersService();
        const preference =
          await service.findAgentEmailNotificationPreference(signal);
        signal.throwIfAborted();
        setIsAgentNotificationsEmail(preference.isEnabled);
        setAgentPreferenceLoadState('ready');
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        logger.error('Failed to load agent email preference', error);
        setAgentPreferenceLoadState('error');
      }
    },
    [getUsersService],
  );

  const refreshAgentPreference = useCallback(() => {
    agentPreferenceController.current?.abort();
    const controller = new AbortController();
    agentPreferenceController.current = controller;
    void loadAgentPreference(controller.signal);
  }, [loadAgentPreference]);

  useEffect(() => {
    refreshAgentPreference();
    return () => agentPreferenceController.current?.abort();
  }, [refreshAgentPreference]);

  const patchSettings = useCallback(
    async (patch: Partial<ISetting>) => {
      if (!currentUser) {
        return false;
      }

      setIsSaving(true);
      try {
        const service = await getUsersService();
        await service.patchMeSettings(patch);
        mutateUser(
          new User({
            ...currentUser,
            settings: { ...currentUser.settings, ...patch },
          }),
        );
        return true;
      } catch (error) {
        logger.error('Failed to update settings', error);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [currentUser, mutateUser, getUsersService],
  );

  const handleWorkflowEmailPreferenceChange = useCallback(
    async (isEnabled: boolean) => {
      const previousValue = isWorkflowNotificationsEmail;
      setIsWorkflowNotificationsEmail(isEnabled);
      setIsSaving(true);
      try {
        const service = await getUsersService();
        const preference =
          await service.patchWorkflowEmailNotificationPreference(isEnabled);
        setIsWorkflowNotificationsEmail(preference.isEnabled);
      } catch (error: unknown) {
        logger.error('Failed to update workflow email preference', error);
        setIsWorkflowNotificationsEmail(previousValue);
        notifications.error(
          translate('settings.profile.workflowEmail.saveError'),
        );
      } finally {
        setIsSaving(false);
      }
    },
    [getUsersService, isWorkflowNotificationsEmail, notifications, translate],
  );

  const handleAgentEmailPreferenceChange = useCallback(
    async (isEnabled: boolean) => {
      const previousValue = isAgentNotificationsEmail;
      setIsAgentNotificationsEmail(isEnabled);
      setIsSaving(true);
      try {
        const service = await getUsersService();
        const preference =
          await service.patchAgentEmailNotificationPreference(isEnabled);
        setIsAgentNotificationsEmail(preference.isEnabled);
      } catch (error: unknown) {
        logger.error('Failed to update agent email preference', error);
        setIsAgentNotificationsEmail(previousValue);
        notifications.error(translate('settings.profile.agentEmail.saveError'));
      } finally {
        setIsSaving(false);
      }
    },
    [getUsersService, isAgentNotificationsEmail, notifications, translate],
  );

  if (!isLoaded) {
    return (
      <div className="flex min-h-form items-center justify-center">
        <span className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const isVideoNotificationsEmail =
    currentUser?.settings?.isVideoNotificationsEmail ?? false;

  return (
    <div className="space-y-4">
      <Card
        id={PERSONAL_SETTINGS_ANCHOR.EMAIL_NOTIFICATIONS}
        label={translate('settings.profile.workflowEmail.cardTitle')}
        bodyClassName="gap-3 p-4"
      >
        <div className="space-y-3">
          <Switch
            aria-label={translate('settings.profile.workflowEmail.label')}
            label={translate('settings.profile.workflowEmail.label')}
            description={translate(
              'settings.profile.workflowEmail.description',
            )}
            isChecked={isWorkflowNotificationsEmail}
            isDisabled={isSaving || workflowPreferenceLoadState !== 'ready'}
            onChange={(e) =>
              handleWorkflowEmailPreferenceChange(e.target.checked)
            }
          />
          {workflowPreferenceLoadState === 'error' ? (
            <Alert type={AlertCategory.WARNING}>
              <div className="flex items-center justify-between gap-3">
                <span>
                  {translate('settings.profile.workflowEmail.loadError')}
                </span>
                <Button
                  label={translate('actions.retry')}
                  onClick={() => {
                    setWorkflowPreferenceLoadRequest((request) => request + 1);
                  }}
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
            isChecked={isAgentNotificationsEmail}
            isDisabled={isSaving || agentPreferenceLoadState !== 'ready'}
            onChange={(e) => handleAgentEmailPreferenceChange(e.target.checked)}
          />
          {agentPreferenceLoadState === 'error' ? (
            <Alert type={AlertCategory.WARNING}>
              <div className="flex items-center justify-between gap-3">
                <span>
                  {translate('settings.profile.agentEmail.loadError')}
                </span>
                <Button
                  label={translate('actions.retry')}
                  onClick={refreshAgentPreference}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                />
              </div>
            </Alert>
          ) : null}
          <Switch
            aria-label={translate('settings.profile.videoEmail.label')}
            label={translate('settings.profile.videoEmail.label')}
            description={translate('settings.profile.videoEmail.description')}
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
