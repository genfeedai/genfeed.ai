'use client';

import { formatPlatformLabel } from '@genfeedai/contracts';
import { getPlatformPreviewIcon } from '@ui/posts/platform-preview/platform-preview-icons';
import { useTranslations } from 'next-intl';
import type { ReleaseHistoryViewProps } from '@/features/posts/props/release-drawer.props';
import {
  releaseTargets,
  targetHistory,
} from '@/features/posts/shared/release-status.helpers';
import { formatInstant } from './format-instant';

/** Every channel's execution timeline, oldest first, one block per channel. */
export default function ReleaseHistoryView({
  release,
}: ReleaseHistoryViewProps): React.JSX.Element {
  const translate = useTranslations('pages.publishing.release');

  return (
    <div className="space-y-5 p-4" data-testid="release-history-view">
      {releaseTargets(release).map((target) => {
        const entries = targetHistory(target);
        const Icon = getPlatformPreviewIcon(target.platform);
        return (
          <section className="space-y-2" key={target.id}>
            <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Icon className="size-4" />
              {formatPlatformLabel(target.platform) ?? target.platform}
            </h3>
            {entries.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {translate('noExecutionHistory')}
              </p>
            ) : (
              <ol className="space-y-3 border-l border-border pl-4">
                {entries.map((entry) => (
                  <li
                    className="relative text-sm"
                    key={`${entry.label}-${entry.at}`}
                  >
                    <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-muted-foreground" />
                    <p className="text-foreground">{entry.label}</p>
                    <p className="text-xs text-muted-foreground">
                      <time dateTime={entry.at}>{formatInstant(entry.at)}</time>
                      {entry.detail ? ` · ${entry.detail}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}
