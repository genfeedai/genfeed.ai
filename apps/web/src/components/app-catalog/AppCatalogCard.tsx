'use client';

import { ButtonVariant, CardVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import type { AppCatalogItemProps } from '@/props/apps/organization-apps-page.props';
import AppCatalogStateBadge from './AppCatalogStateBadge';
import AppCatalogThumbnail from './AppCatalogThumbnail';

/**
 * One app in the grid: artwork, name and state, what it does, and its
 * actions. The card is picked through an overlay button so the actions inside
 * it stay real, separate controls.
 */
export default function AppCatalogCard({
  actions,
  app,
  categoryLabel,
  isSelected,
  onSelect,
}: AppCatalogItemProps) {
  const translate = useTranslations('common.apps');

  return (
    <Card
      bodyClassName="h-full gap-0 p-0"
      className={cn(
        'group h-full hover:border-border-strong',
        isSelected && 'border-foreground hover:border-foreground',
      )}
      data-testid={`apps-app-${app.appId}`}
      variant={CardVariant.BORDERED}
    >
      <Button
        ariaLabel={translate(isSelected ? 'selectedApp' : 'selectApp', {
          app: app.label,
        })}
        aria-pressed={isSelected}
        className="absolute inset-0 z-10 rounded-card"
        onClick={() => onSelect(app.appId)}
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
      />
      <AppCatalogThumbnail
        appId={app.appId}
        icon={app.icon}
        label={app.label}
        size="card"
      />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="min-w-0 truncate text-sm font-semibold">
            {app.label}
          </h3>
          <AppCatalogStateBadge app={app} />
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {app.description}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {categoryLabel}
          </span>
          <div className="relative z-20">{actions}</div>
        </div>
      </div>
    </Card>
  );
}
