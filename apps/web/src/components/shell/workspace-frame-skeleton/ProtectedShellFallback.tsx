'use client';

import { useTranslations } from 'next-intl';
import WorkspaceFrame from '@/components/shell/workspace-frame-skeleton/WorkspaceFrame';

/**
 * What the protected layout prerenders while the pathname is unknown: the app
 * frame without a menu column or stored rail, because both depend on the URL
 * or the device. Without it the shell is blank until JavaScript runs.
 */
export default function ProtectedShellFallback() {
  const translate = useTranslations('pages.organizationRouting.pending');

  return (
    <WorkspaceFrame
      bootRecord={null}
      hasSidebar={false}
      label={translate('loading')}
    />
  );
}
