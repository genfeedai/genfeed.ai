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
import { useRouter } from 'next/navigation';

// The menu brings the dropdown menu and its positioning code (about 38 kB of
// first-load JS), which every profile route would pay for although only the
// Wall tab shows a filter. It loads after the page is interactive; until then
// the trigger is a plain disabled button of the same size.
const FilterMenu = dynamic(
  () => import('@ui/navigation/filter-menu/FilterMenu'),
  {
    loading: () => (
      <Button
        className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
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
 * Narrows the wall to one platform with the shared Filters menu, the same
 * control every list in the app uses. The choice lives in the URL as
 * `?platform=`, so a filtered wall can be linked and the page stays rendered
 * on the server.
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
