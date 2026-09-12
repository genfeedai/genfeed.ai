'use client';

// biome-ignore assist/source/organizeImports: React and external packages precede package imports and path aliases.
import { useCallback, useState } from 'react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { AgentThreadMode } from '@genfeedai/contracts';
import {
  type AppLocale,
  DEFAULT_LOCALE,
  DEFAULT_THEME,
  getSelectableLocales,
  isThemePreference,
  LOCALE_LABELS,
  THEME_PREFERENCES,
  type ThemePreference,
} from '@genfeedai/contracts/constants';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Switch } from '@ui/primitives/switch';

type ExtendedSettingPatch = Partial<ISetting>;

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

const AGENT_MODE_LABELS: Record<AgentThreadMode, string> = {
  [AgentThreadMode.AUTO]: 'Auto',
  [AgentThreadMode.MANUAL]: 'Manual',
  [AgentThreadMode.PLAN]: 'Plan',
};

const AGENT_MODE_DESCRIPTIONS: Record<AgentThreadMode, string> = {
  [AgentThreadMode.AUTO]:
    'Auto — the Agent generates, writes brand context, and runs gated actions without asking. Sending to people or publishing still confirms.',
  [AgentThreadMode.MANUAL]:
    'Manual — the Agent asks before spending credits, writing brand context, or running a gated action.',
  [AgentThreadMode.PLAN]:
    'Plan — the Agent drafts a plan with a credit estimate and runs it only after you approve.',
};

function isAgentThreadMode(value: string): value is AgentThreadMode {
  return (Object.values(AgentThreadMode) as string[]).includes(value);
}

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

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center min-h-form">
        <span className="animate-spin size-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const isAdvancedMode = currentUser?.settings?.isAdvancedMode ?? true;
  const agentMode = currentUser?.settings?.agentMode ?? AgentThreadMode.MANUAL;
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
        id={PERSONAL_SETTINGS_ANCHOR.LANGUAGE}
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
        id={PERSONAL_SETTINGS_ANCHOR.APPEARANCE}
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

      <Card
        id={PERSONAL_SETTINGS_ANCHOR.FEATURES}
        label="Features"
        bodyClassName="gap-3 p-4"
      >
        <Switch
          label="Advanced Mode"
          description="Show studio, workflow editor, automation tools, and individual generation pages. Recommended for power users."
          isChecked={isAdvancedMode}
          isDisabled={isSaving}
          onChange={(e) => patchSettings({ isAdvancedMode: e.target.checked })}
        />
      </Card>

      <Card
        description={translate('settings.profile.agentMode.description')}
        label={translate('settings.profile.agentMode.label')}
        bodyClassName="gap-3 p-4"
      >
        <Select
          disabled={isSaving}
          onValueChange={(value) => {
            if (isAgentThreadMode(value)) {
              patchSettings({ agentMode: value });
            }
          }}
          value={agentMode}
        >
          <SelectTrigger
            aria-label={translate('settings.profile.agentMode.fieldAriaLabel')}
            id="personal-agent-mode"
            className="w-full"
            data-testid="personal-agent-mode-trigger"
          >
            <SelectValue
              placeholder={translate('settings.profile.agentMode.placeholder')}
            />
          </SelectTrigger>
          <SelectContent>
            {Object.values(AgentThreadMode).map((mode) => (
              <SelectItem key={mode} value={mode}>
                {AGENT_MODE_LABELS[mode]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {AGENT_MODE_DESCRIPTIONS[agentMode]}
        </p>
      </Card>
    </div>
  );
}
