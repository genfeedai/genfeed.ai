'use client';

import { ContextSidebarPanel } from '@contexts/ui/context-sidebar-context';
import type { PluginAppDetailsPanelProps } from '@genfeedai/props/plugins/organization-plugins-page.props';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import PluginAppStateBadge from './PluginAppStateBadge';
import PluginAppThumbnail from './PluginAppThumbnail';

/** The selected plugin in the right sidebar: preview, what it does, actions. */
export default function PluginAppDetailsPanel({
  accessNote,
  actions,
  app,
  categoryLabel,
  children,
  onClose,
}: PluginAppDetailsPanelProps) {
  const translate = useTranslations('common.plugins');

  if (app === null) {
    return (
      <ContextSidebarPanel onClose={onClose} selection={null}>
        {null}
      </ContextSidebarPanel>
    );
  }

  return (
    <ContextSidebarPanel
      onClose={onClose}
      selection={{
        id: app.appId,
        kind: 'plugin',
        origin: 'user',
        subtitle: categoryLabel,
        title: app.label,
      }}
    >
      <div className="flex flex-col gap-4 p-4" data-testid="plugins-app-detail">
        <div className="overflow-hidden rounded-card border border-border">
          <PluginAppThumbnail
            appId={app.appId}
            icon={app.icon}
            label={app.label}
            size="card"
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <PluginAppStateBadge app={app} />
          {actions}
        </div>
        <p className="text-sm text-foreground/80">{app.summary}</p>
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            {translate('whatYouCanDo')}
          </h3>
          <ul className="flex flex-col gap-2 text-sm">
            {app.highlights.map((highlight) => (
              <li key={highlight} className="flex items-start gap-2">
                <Check
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <span>{highlight}</span>
              </li>
            ))}
          </ul>
        </div>
        {accessNote}
        {children}
      </div>
    </ContextSidebarPanel>
  );
}
