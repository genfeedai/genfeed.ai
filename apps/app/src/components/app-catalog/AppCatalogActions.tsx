import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { AppCatalogActionsProps } from '@genfeedai/props/apps/organization-apps-page.props';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { isAppCatalogOpenable } from './app-catalog-state';

/** Open or Add, with Pin and Remove in the overflow menu once installed. */
export default function AppCatalogActions({
  app,
  isPending,
  isPinned,
  onInstall,
  onTogglePin,
  onUninstall,
}: AppCatalogActionsProps) {
  const translate = useTranslations('common.apps');
  const translateRail = useTranslations('common.appRail');
  const isOpenable = isAppCatalogOpenable(app);
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
