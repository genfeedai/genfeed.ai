'use client';

import { formatPlatformLabel } from '@genfeedai/contracts';
import { toConnectedAccount } from '@genfeedai/helpers/publisher/connected-account.helper';
import { stripHtmlToPlainText } from '@helpers/security/strip-html.helper';
import AccountPicker from '@ui/display/connected-account/AccountPicker';
import { MediaCarousel } from '@ui/posts/platform-preview/PlatformPreviewMedia';
import { getPlatformPreviewIcon } from '@ui/posts/platform-preview/platform-preview-icons';
import { Avatar } from '@ui/primitives/avatar';
import { Globe } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { buildTargetPreview } from '@/components/previews/preview.helpers';
import type {
  ReleaseGlobalPreviewProps,
  ReleasePreviewPanelProps,
} from '@/features/posts/props/release-drawer.props';
import ReleaseTargetPreview from '@/features/posts/release/release-target-preview';
import {
  useReleaseTargetPost,
  useReleaseWithPostMedia,
} from '@/features/posts/release/use-release-target-post';
import ReleaseTargetStateBadge from '@/features/posts/shared/ReleaseTargetStateBadge';
import { releaseTargets } from '@/features/posts/shared/release-status.helpers';

const GLOBAL_VIEW = 'global';

/**
 * The post as authored, before any channel reshapes it: the account it comes
 * from, every slide in publishing order, the caption, and where it goes.
 */
function ReleaseGlobalPreview({
  release,
  targets,
}: ReleaseGlobalPreviewProps): React.JSX.Element {
  const translate = useTranslations('pages.publishing.release');
  const firstTarget = targets[0];
  const post = useReleaseTargetPost(firstTarget?.id);
  const previewRelease = useReleaseWithPostMedia(release, post);
  const preview = firstTarget
    ? buildTargetPreview({
        credential: firstTarget.credential ??
          post?.credential ?? { platform: firstTarget.platform },
        release: previewRelease,
        target: firstTarget,
      })
    : null;
  const caption =
    stripHtmlToPlainText(release.baseContent) ||
    stripHtmlToPlainText(post?.description) ||
    '';

  return (
    <article
      className="overflow-hidden rounded-lg border border-border bg-background"
      data-testid="release-global-preview"
    >
      {preview ? (
        <header className="flex items-center gap-3 px-3 py-2.5">
          <Avatar
            name={preview.author?.name}
            referrerPolicy="no-referrer"
            size="lg"
            src={preview.author?.avatarUrl}
          />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-foreground">
              {preview.author?.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {preview.author?.handle}
            </p>
          </div>
        </header>
      ) : null}
      {preview?.media && preview.media.length > 0 ? (
        <MediaCarousel items={preview.media} />
      ) : null}
      <p className="whitespace-pre-wrap break-words px-3 py-3 text-sm leading-6 text-foreground">
        {caption || (
          <span className="text-muted-foreground">
            {translate('preview.emptyCaption')}
          </span>
        )}
      </p>
      <ul className="divide-y divide-border border-t border-border">
        {targets.map((target) => {
          const Icon = getPlatformPreviewIcon(target.platform);
          return (
            <li
              className="flex items-center gap-2 px-3 py-2 text-sm"
              key={target.id}
            >
              <Icon className="size-4 shrink-0" />
              <span className="font-medium text-foreground">
                {formatPlatformLabel(target.platform) ?? target.platform}
              </span>
              <ReleaseTargetStateBadge
                className="ml-auto"
                executionState={target.executionState}
                isInboxDelivery={target.isInboxDelivery}
              />
            </li>
          );
        })}
      </ul>
    </article>
  );
}

/**
 * The drawer's main view: a Global preview plus one chip per channel, each
 * drawn in that platform's own layout (a carousel swipes, like the feed).
 */
export default function ReleasePreviewPanel({
  release,
}: ReleasePreviewPanelProps): React.JSX.Element {
  const translate = useTranslations('pages.publishing.release');
  const targets = releaseTargets(release);
  const [selected, setSelected] = useState<string>(GLOBAL_VIEW);
  const activeTarget = targets.find((target) => target.id === selected);
  const items = [
    {
      icon: <Globe />,
      id: GLOBAL_VIEW,
      label: translate('preview.global'),
      platform: GLOBAL_VIEW,
    },
    ...targets.map((target) => ({
      ...(target.credential
        ? toConnectedAccount(target.credential)
        : { platform: target.platform }),
      id: target.id,
    })),
  ];

  return (
    <div className="space-y-3 p-4" data-testid="release-preview-panel">
      <AccountPicker
        ariaLabel={translate('preview.channel')}
        items={items}
        onValueChange={(next) => {
          if (next) {
            setSelected(next);
          }
        }}
        value={activeTarget ? activeTarget.id : GLOBAL_VIEW}
      />
      {activeTarget ? (
        <ReleaseTargetPreview
          key={activeTarget.id}
          release={release}
          target={activeTarget}
        />
      ) : (
        <ReleaseGlobalPreview release={release} targets={targets} />
      )}
    </div>
  );
}
