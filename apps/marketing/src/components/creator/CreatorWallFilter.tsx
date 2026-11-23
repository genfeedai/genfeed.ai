'use client';

import {
  ButtonSize,
  ButtonVariant,
  formatPlatformLabel,
} from '@genfeedai/contracts';
import { creatorTabPath } from '@genfeedai/contracts/constants';
import { getPlatformIconComponent } from '@genfeedai/helpers/ui/platform-icon/platform-icon.helper';
import type { CreatorWallFilterProps } from '@props/content/creator.props';
import { Button } from '@ui/primitives/button';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// The menu brings the dropdown menu and its positioning code (about 38 kB of
// first-load JS), which every profile route would pay for although only the
// Posts tab shows a filter. It loads after the page is interactive; until then
// the trigger is a disabled ghost button.
const FilterMenu = dynamic(
  () => import('@ui/navigation/filter-menu/FilterMenu'),
  {
    loading: () => (
      <Button
        isDisabled
        size={ButtonSize.SM}
        variant={ButtonVariant.GHOST}
        withWrapper={false}
      >
        Filters
      </Button>
    ),
    ssr: false,
  },
);

/**
 * Narrows the posts to one platform with the shared Filters menu, the same
 * control every list in the app uses. The choice lives in the URL as
 * `?platform=`, so a filtered list can be linked and the page stays rendered
 * on the server.
 *
 * The menu loads after the page is interactive, so the server HTML also holds
 * a link for every post and for each platform. They keep every filtered
 * view reachable and crawlable without script, and a screen reader finds them
 * before the menu is ready; the menu is what a sighted visitor uses.
 */
export default function CreatorWallFilter({
  active,
  handle,
  platforms,
}: CreatorWallFilterProps): React.ReactElement | null {
  const router = useRouter();

  if (platforms.length < 2) {
    return null;
  }

  const base = creatorTabPath(handle, 'posts');

  return (
    <div className="flex justify-end">
      <nav aria-label="Filter posts by platform" className="sr-only">
        <ul>
          <li>
            <Link aria-current={active ? undefined : 'page'} href={base}>
              All platforms
            </Link>
          </li>
          {platforms.map((platform) => (
            <li key={platform}>
              <Link
                aria-current={active === platform ? 'page' : undefined}
                href={`${base}?platform=${platform}`}
              >
                {formatPlatformLabel(platform) ?? platform}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <FilterMenu
        allLabel="All"
        clearLabel="Clear filters"
        facets={[
          {
            defaultValue: '',
            key: 'platform',
            label: 'Platform',
            onChange: (platform) =>
              router.push(platform ? `${base}?platform=${platform}` : base),
            options: platforms.map((platform) => {
              const Icon = getPlatformIconComponent(platform);

              return {
                icon: Icon ? (
                  <Icon aria-hidden="true" className="size-4" />
                ) : undefined,
                label: formatPlatformLabel(platform) ?? platform,
                value: platform,
              };
            }),
            selection: 'single',
            value: active ?? '',
          },
        ]}
        getActiveCountLabel={(count) =>
          count === 1 ? '1 active filter' : `${count} active filters`
        }
        label="Filters"
        onClear={() => router.push(base)}
      />
    </div>
  );
}
