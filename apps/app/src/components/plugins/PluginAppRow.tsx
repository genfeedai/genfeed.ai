'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PluginAppItemProps } from '@genfeedai/props/plugins/organization-plugins-page.props';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import PluginAppStateBadge from './PluginAppStateBadge';
import PluginAppThumbnail from './PluginAppThumbnail';

/**
 * One plugin in the list: thumbnail, name, what it does, state and actions.
 * Same overlay-button selection as the card, so the actions stay separate
 * controls.
 */
export default function PluginAppRow({
  actions,
  app,
  categoryLabel,
  isSelected,
  onSelect,
}: PluginAppItemProps) {
  const translate = useTranslations('common.plugins');

  return (
    <ListRow
      className={cn('relative', isSelected && 'bg-accent')}
      data-testid={`plugins-app-${app.appId}`}
      description={app.description}
      leading={
        <>
          <Button
            ariaLabel={translate(isSelected ? 'selectedApp' : 'selectApp', {
              app: app.label,
            })}
            aria-pressed={isSelected}
            className="absolute inset-0"
            onClick={() => onSelect(app.appId)}
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
          />
          <PluginAppThumbnail
            appId={app.appId}
            icon={app.icon}
            label={app.label}
            size="compact"
          />
        </>
      }
      meta={
        <>
          <PluginAppStateBadge app={app} />
          <span>{categoryLabel}</span>
        </>
      }
      title={app.label}
      trailing={<div className="relative z-10">{actions}</div>}
    />
  );
}
