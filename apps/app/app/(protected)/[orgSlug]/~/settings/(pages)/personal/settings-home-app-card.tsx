'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  DEFAULT_HOME_APP_ID,
  isRailAppId,
} from '@genfeedai/contracts/constants';
import Card from '@ui/card/Card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { useTranslations } from 'next-intl';
import { useRailPreferencesContext } from '@/components/shell/rail-preferences.provider';
import { useAvailableRailApps } from '@/components/shell/use-available-rail-apps';

const DEFAULT_HOME_VALUE = 'default';

/**
 * Settings → Personal: the app this member lands on after signing in. It
 * draws from the same list the rail does, so it never offers an app the
 * member cannot open. Default follows the organization, then Workspace.
 */
export default function SettingsHomeAppCard() {
  const translate = useTranslations('common.settings.profile.homeApp');
  const translateRail = useTranslations('common.appRail');
  const { settings } = useBrand();
  const { apps } = useAvailableRailApps();
  const { homeAppId, isLoaded, setHomeAppId } = useRailPreferencesContext();

  const organizationHomeAppId = settings?.defaultHomeAppId;
  const defaultApp =
    apps.find((app) => app.id === organizationHomeAppId) ??
    apps.find((app) => app.id === DEFAULT_HOME_APP_ID);
  const selectedValue =
    homeAppId && isRailAppId(homeAppId) && apps.some((a) => a.id === homeAppId)
      ? homeAppId
      : DEFAULT_HOME_VALUE;

  return (
    <Card
      bodyClassName="gap-3 p-4"
      description={translate('description')}
      label={translate('label')}
    >
      <Select
        disabled={!isLoaded}
        onValueChange={(value) =>
          setHomeAppId(value === DEFAULT_HOME_VALUE ? null : value)
        }
        value={selectedValue}
      >
        <SelectTrigger
          aria-label={translate('fieldAriaLabel')}
          className="w-full"
          data-testid="personal-home-app-trigger"
          id="personal-home-app"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={DEFAULT_HOME_VALUE}>
            {translateRail('homeDefault', {
              app: defaultApp ? translateRail(defaultApp.label) : '',
            })}
          </SelectItem>
          {apps.map((app) => (
            <SelectItem key={app.id} value={app.id}>
              {translateRail(app.label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Card>
  );
}
