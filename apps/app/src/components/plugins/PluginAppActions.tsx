import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { PluginAppActionsProps } from '@genfeedai/props/plugins/organization-plugins-page.props';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { isPluginAppOpenable } from './plugin-app-state';

/** Open or Add, with Pin and Remove in the overflow menu once installed. */
export default function PluginAppActions({
  app,
  isPending,
  isPinned,
  onInstall,
  onTogglePin,
  onUninstall,
}: PluginAppActionsProps) {
  const translate = useTranslations('common.plugins');
  const translateRail = useTranslations('common.appRail');
  const isOpenable = isPluginAppOpenable(app);
  const isLocked = !isOpenable && app.state !== 'not-installed';

  return (
    <CollectionItemActions
      primary={
        isOpenable ? (
          <Button
            asChild
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          >
            <Link
              aria-label={`${translate('open')} ${app.label}`}
              href={app.openHref}
            >
              {translate('open')}
            </Link>
          </Button>
        ) : (
          <Button
            ariaLabel={`${translate('install')} ${app.label}`}
            isDisabled={isPending || isLocked}
            onClick={() => onInstall(app.appId)}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
          >
            {translate('install')}
          </Button>
        )
      }
      overflow={
        app.isInstalled
          ? [
              ...(isOpenable
                ? [
                    {
                      id: 'pin',
                      isDisabled: isPending,
                      label: translateRail(isPinned ? 'unpin' : 'pin', {
                        app: app.label,
                      }),
                      onSelect: () => onTogglePin(app.appId),
                    },
                  ]
                : []),
              {
                id: 'uninstall',
                isDisabled: isPending,
                label: translate('uninstall'),
                onSelect: () => onUninstall(app.appId),
              },
            ]
          : undefined
      }
      overflowLabel={app.label}
    />
  );
}
