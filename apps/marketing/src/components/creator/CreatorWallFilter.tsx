import { formatPlatformLabel } from '@genfeedai/contracts';
import { creatorTabPath } from '@genfeedai/contracts/constants';
import { cn } from '@genfeedai/helpers';
import { getPlatformIconComponent } from '@genfeedai/helpers/ui/platform-icon/platform-icon.helper';
import type { CreatorWallFilterProps } from '@props/content/creator.props';
import Link from 'next/link';

const CHIP_CLASS =
  'inline-flex h-8 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors';

/**
 * Narrows the wall to one platform. Each chip is a link to the same page with
 * `?platform=`, so a filtered wall is a URL and needs no script.
 */
export default function CreatorWallFilter({
  active,
  handle,
  platforms,
}: CreatorWallFilterProps): React.ReactElement | null {
  if (platforms.length < 2) {
    return null;
  }

  const base = creatorTabPath(handle, 'posts');

  return (
    <nav aria-label="Filter by platform" className="flex flex-wrap gap-2">
      {[null, ...platforms].map((platform) => {
        const Icon = platform ? getPlatformIconComponent(platform) : undefined;
        const isActive = platform === active;

        return (
          <Link
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              CHIP_CLASS,
              isActive
                ? 'border-foreground bg-foreground text-background'
                : 'border-border text-foreground/60 hover:border-border-strong hover:text-foreground',
            )}
            href={platform ? `${base}?platform=${platform}` : base}
            key={platform ?? 'all'}
          >
            {Icon ? <Icon aria-hidden="true" className="size-3.5" /> : null}
            {platform ? (formatPlatformLabel(platform) ?? platform) : 'All'}
          </Link>
        );
      })}
    </nav>
  );
}
