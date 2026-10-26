import type { PluginAppStateProps } from '@genfeedai/props/plugins/organization-plugins-page.props';
import { Badge } from '@ui/primitives/badge';
import { Check, LockKeyhole } from 'lucide-react';
import { useTranslations } from 'next-intl';

/** Where one plugin stands for the member, as a badge. */
export default function PluginAppStateBadge({ app }: PluginAppStateProps) {
  const translate = useTranslations('common.plugins');

  switch (app.state) {
    case 'pinned':
      return (
        <Badge data-app-state={app.state} icon={<Check />} variant="success">
          {translate('pinned')}
        </Badge>
      );
    case 'installed':
      return (
        <Badge data-app-state={app.state} icon={<Check />} variant="success">
          {translate('status.installed')}
        </Badge>
      );
    case 'not-installed':
      return (
        <Badge data-app-state={app.state} variant="secondary">
          {translate('status.available')}
        </Badge>
      );
    case 'organization-disabled':
      return (
        <Badge
          data-app-state={app.state}
          icon={<LockKeyhole />}
          variant="warning"
        >
          {translate('badges.organizationDisabled')}
        </Badge>
      );
    case 'subscription-required':
      return (
        <Badge
          data-app-state={app.state}
          icon={<LockKeyhole />}
          variant="warning"
        >
          {translate('badges.subscriptionRequired')}
        </Badge>
      );
    default:
      return (
        <Badge
          data-app-state={app.state}
          icon={<LockKeyhole />}
          variant="warning"
        >
          {translate('badges.unavailable')}
        </Badge>
      );
  }
}
