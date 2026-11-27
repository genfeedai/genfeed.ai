'use client';

import { getClientSurface } from '@genfeedai/config/deployment';
import { useTranslations } from 'next-intl';
import { useSyncExternalStore } from 'react';
import DesktopEditingToolsSettings from '@/components/desktop/DesktopEditingToolsSettings';
import DesktopWorkspaceSettings from '@/components/desktop/DesktopWorkspaceSettings';

const subscribeToClientSurface = () => () => {};

/** Workspace folder and editing tools. Only the Desktop app has either. */
export default function DesktopContent() {
  const translate = useTranslations('pages.desktopSettings');
  const surface = useSyncExternalStore(
    subscribeToClientSurface,
    getClientSurface,
    () => 'web',
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="sr-only">{translate('title')}</h1>
      {surface === 'desktop' ? (
        <>
          <DesktopWorkspaceSettings />
          <DesktopEditingToolsSettings />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {translate('unavailable')}
        </p>
      )}
    </div>
  );
}
