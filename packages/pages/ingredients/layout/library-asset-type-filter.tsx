'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import ButtonDropdown from '@ui/buttons/dropdown/button-dropdown/ButtonDropdown';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const LIBRARY_ASSET_TYPE_OPTIONS = [
  { label: 'Videos', value: 'videos' },
  { label: 'Images', value: 'images' },
  { label: 'GIFs', value: 'gifs' },
  { label: 'Avatars', value: 'avatars' },
  { label: 'Voices', value: 'voices' },
  { label: 'Music', value: 'music' },
  { label: 'Captions', value: 'captions' },
] as const;

const LIBRARY_ROUTE_BY_TYPE = {
  avatars: APP_ROUTES.LIBRARY.AVATARS,
  captions: APP_ROUTES.LIBRARY.CAPTIONS,
  gifs: APP_ROUTES.LIBRARY.GIFS,
  images: APP_ROUTES.LIBRARY.IMAGES,
  music: APP_ROUTES.LIBRARY.MUSIC,
  videos: APP_ROUTES.LIBRARY.VIDEOS,
  voices: APP_ROUTES.LIBRARY.VOICES,
} as const;

const TYPE_SPECIFIC_QUERY_KEYS = [
  'format',
  'page',
  'provider',
  'sort',
  'status',
] as const;

function getCurrentType(pathname: string): string {
  const routeType = pathname.split('/').filter(Boolean).at(-1) ?? 'videos';
  return routeType === 'musics' ? 'music' : routeType;
}

export default function LibraryAssetTypeFilter() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { replace } = useRouter();
  const { href } = useOrgUrl();
  const currentType = getCurrentType(pathname);

  const handleTypeChange = (_name: string, nextType: string) => {
    if (!(nextType in LIBRARY_ROUTE_BY_TYPE) || nextType === currentType) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams.toString());
    for (const key of TYPE_SPECIFIC_QUERY_KEYS) {
      nextSearchParams.delete(key);
    }

    const nextQuery = nextSearchParams.toString();
    const nextPath =
      LIBRARY_ROUTE_BY_TYPE[nextType as keyof typeof LIBRARY_ROUTE_BY_TYPE];

    replace(`${href(nextPath)}${nextQuery ? `?${nextQuery}` : ''}`, {
      scroll: false,
    });
  };

  return (
    <ButtonDropdown
      name="assetType"
      value={currentType}
      options={LIBRARY_ASSET_TYPE_OPTIONS}
      onChange={handleTypeChange}
      tooltip="Filter by asset type"
    />
  );
}
