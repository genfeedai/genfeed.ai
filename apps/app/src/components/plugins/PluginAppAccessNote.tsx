import type { PluginAppAccessNoteProps } from '@genfeedai/props/plugins/organization-plugins-page.props';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

const LINK_CLASS_NAME = 'ml-1 underline underline-offset-2';

/** Why a plugin cannot be opened, with the place to change it. */
export default function PluginAppAccessNote({
  manageModulesHref,
  state,
  subscriptionHref,
}: PluginAppAccessNoteProps) {
  const translate = useTranslations('common.plugins');

  switch (state) {
    case 'organization-disabled':
      return (
        <p className="text-xs text-muted-foreground">
          {translate('organizationDisabled')}
          <Link className={LINK_CLASS_NAME} href={manageModulesHref}>
            {translate('manageModules')}
          </Link>
        </p>
      );
    case 'subscription-required':
      return (
        <p className="text-xs text-muted-foreground">
          {translate('subscriptionRequired')}
          <Link className={LINK_CLASS_NAME} href={subscriptionHref}>
            {translate('viewPlans')}
          </Link>
        </p>
      );
    case 'unavailable':
      return (
        <p className="text-xs text-muted-foreground">
          {translate('unavailable')}
        </p>
      );
    default:
      return null;
  }
}
