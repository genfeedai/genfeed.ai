'use client';

// biome-ignore assist/source/organizeImports: React and external packages precede package imports and path aliases.
import { useCallback, useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import {
  type AppLocale,
  DEFAULT_LOCALE,
  DEFAULT_THEME,
  getSelectableLocales,
  isThemePreference,
  LOCALE_LABELS,
  THEME_PREFERENCES,
  type ThemePreference,
} from '@genfeedai/constants';
import { AlertCategory, ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { ISetting } from '@genfeedai/interfaces';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Switch } from '@ui/primitives/switch';

type ExtendedSettingPatch = Partial<ISetting> & {
  isVideoNotificationsEmail?: boolean;
};

type WorkflowPreferenceLoadState = 'error' | 'loading' | 'ready';

// Baked in at module load, matching ServiceWorkerRegistrar. The pseudo-locale is
// a QA instrument, not a language — a customer who lands on accented, padded
// English reasonably reports it as a bug.
const SELECTABLE_LOCALES = getSelectableLocales(
  process.env.NODE_ENV !== 'production',
);

const THEME_LABELS: Record<ThemePreference, string> = {
  dark: 'Dark',
  light: 'Light',
  system: 'System',
};

export default function SettingsProfilePage() {
  const translate = useTranslations('common');
  const { user, isLoaded } = useAuthUser();
  const { currentUser, mutateUser } = useCurrentUser();
  const { setTheme, theme } = useTheme();
  const notifications = NotificationsService.getInstance();

  const getUsersService = useAuthedService((token: string) =>
    UsersService.getInstance(token),
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isWorkflowNotificationsEmail, setIsWorkflowNotificationsEmail] =
    useState(false);
  const [workflowPreferenceLoadState, setWorkflowPreferenceLoadState] =
    useState<WorkflowPreferenceLoadState>('loading');
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

  const patchSettings = useCallback(
    async (patch: ExtendedSettingPatch) => {
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

  const handleThemeChange = useCallback(
    async (value: string) => {
      if (!isThemePreference(value)) {
        return;
      }

      const storedTheme = currentUser?.settings?.theme;
      const previousTheme = isThemePreference(theme)
        ? theme
        : isThemePreference(storedTheme)
          ? storedTheme
          : DEFAULT_THEME;

      setTheme(value);

      if (!(await patchSettings({ theme: value }))) {
        setTheme(previousTheme);
        notifications.error('Failed to save your appearance preference.');
      }
    },
    [
      currentUser?.settings?.theme,
      notifications,
      patchSettings,
      setTheme,
      theme,
    ],
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
  const storedTheme = currentUser?.settings?.theme;
  const selectedTheme = isThemePreference(theme)
    ? theme
    : isThemePreference(storedTheme)
      ? storedTheme
      : DEFAULT_THEME;
  const isVideoNotificationsEmail =
    (currentUser?.settings as ExtendedSettingPatch | undefined)
      ?.isVideoNotificationsEmail ?? false;

  return (
    <div className="space-y-4">
      <Card label="Profile Information" bodyClassName="gap-3 p-4">
        <div className="space-y-3">
          <div>
            <p className="text-sm text-muted-foreground">
              {translate('settings.profile.fields.name')}
            </p>
            <p className="font-medium">
              {user?.fullName || translate('settings.profile.fields.notSet')}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              {translate('settings.profile.fields.email')}
            </p>
            <p className="font-medium">
              {user?.primaryEmailAddress?.emailAddress ||
                translate('settings.profile.fields.notSet')}
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

      <Card
        label="Appearance"
        description="Choose a light or dark interface, or follow your device setting."
        bodyClassName="gap-3 p-4"
      >
        <Select
          disabled={isSaving}
          onValueChange={handleThemeChange}
          value={selectedTheme}
        >
          <SelectTrigger
            aria-label="Appearance"
            id="personal-appearance"
            className="w-full"
            data-testid="personal-appearance-trigger"
          >
            <SelectValue placeholder="Select an appearance" />
          </SelectTrigger>
          <SelectContent>
            {THEME_PREFERENCES.map((preference) => (
              <SelectItem key={preference} value={preference}>
                {THEME_LABELS[preference]}
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

      <Card
        label={translate('settings.profile.workflowEmail.cardTitle')}
        bodyClassName="gap-3 p-4"
      >
        <div className="space-y-3">
          <Switch
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
