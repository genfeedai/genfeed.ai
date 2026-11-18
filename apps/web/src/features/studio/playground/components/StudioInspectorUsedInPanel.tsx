'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import type { StudioInspectorUsedInPanelProps } from '@/features/studio/props/studio-playground-inspector.props';

/** The posts that use the asset, each linking to its post. */
export default function StudioInspectorUsedInPanel({
  isLoading,
  posts,
}: StudioInspectorUsedInPanelProps): ReactElement {
  const translate = useTranslations('pages.studioPlayground');
  const { href } = useOrgUrl();
  return (
    <div className="px-4 py-3">
      {isLoading ? (
        <p className="text-xs text-muted-foreground">
          {translate('inspector.loading')}
        </p>
      ) : posts.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {translate('inspector.emptyUsedIn')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {posts.map((post) => (
            <li key={post.id}>
              <Link
                className="block truncate text-xs text-foreground hover:underline"
                href={href(`${APP_ROUTES.PUBLISHING.POSTS}/${post.id}`)}
              >
                {post.label || post.id}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
