'use client';

import { ButtonSize, ButtonVariant, CardEmptySize } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import { Button } from '@ui/primitives/button';
import { ExternalLink, File, Globe } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import LibrarySourcePreview, {
  getLibrarySourceLabel,
} from '@/features/library-remix/LibrarySourcePreview';
import { dispatchOpenFilesTab } from '@/lib/workspace/agent-composer-events';
import { resolveInspectorBrowserPreview } from '@/lib/workspace-shell/workspace-inspector-preview.util';

import { useWorkspaceInspectorPreview } from './WorkspaceInspectorPreviewContext';

export default function WorkspaceInspectorBrowserPane({
  pageUrl = null,
}: {
  readonly pageUrl?: string | null;
}) {
  const translate = useTranslations('common.workspaceInspector.browserPane');
  const { href } = useOrgUrl();
  const { preview } = useWorkspaceInspectorPreview();
  const resolved = resolveInspectorBrowserPreview({
    pageUrl,
    selected: preview,
  });
  const managementHref = href(APP_ROUTES.LIBRARY.ROOT);

  if (resolved.kind === 'library') {
    const label = getLibrarySourceLabel(resolved.record);

    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
        <LibrarySourcePreview
          className="rounded-md"
          record={resolved.record}
          reference={resolved.reference}
        />
        <p className="mt-3 truncate text-sm font-medium text-foreground">
          {label}
        </p>
        <Button
          asChild
          className="mt-3"
          icon={<File className="size-4" />}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          <Link href={managementHref}>{translate('openLibrary')}</Link>
        </Button>
      </div>
    );
  }

  if (resolved.kind === 'url') {
    return (
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <iframe
          className="min-h-48 w-full flex-1 rounded-md border border-border bg-background"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-popups allow-forms allow-popups-to-escape-sandbox"
          src={resolved.url}
          title={translate('pagePreview', { host: resolved.label })}
        />
        <Button
          asChild
          className="mt-3"
          icon={<ExternalLink className="size-4" />}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
        >
          <Link href={resolved.url} rel="noreferrer" target="_blank">
            {translate('openPage')}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center p-3">
      <CardEmptyContent
        action={{
          label: translate('openFiles'),
          onClick: dispatchOpenFilesTab,
        }}
        className="gen-shell-empty-state rounded-lg py-8"
        description={translate('emptyDescription')}
        icon={Globe}
        label={translate('emptyTitle')}
        size={CardEmptySize.SM}
      />
    </div>
  );
}
