'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { OptionSelect } from '@ui/primitives/option-select';
import {
  Captions,
  Film,
  Image,
  Mic,
  Music,
  UserRound,
  Video,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const ICON_CLASS_NAME = 'size-4';

const LIBRARY_ASSET_TYPE_OPTIONS = [
  {
    icon: <Video className={ICON_CLASS_NAME} />,
    label: 'Videos',
    value: 'videos',
  },
  {
    icon: <Image className={ICON_CLASS_NAME} />,
    label: 'Images',
    value: 'images',
  },
  { icon: <Film className={ICON_CLASS_NAME} />, label: 'GIFs', value: 'gifs' },
  {
    icon: <UserRound className={ICON_CLASS_NAME} />,
    label: 'Avatars',
    value: 'avatars',
  },
  {
    icon: <Mic className={ICON_CLASS_NAME} />,
    label: 'Voices',
    value: 'voices',
  },
  {
    icon: <Music className={ICON_CLASS_NAME} />,
    label: 'Music',
    value: 'music',
  },
  {
    icon: <Captions className={ICON_CLASS_NAME} />,
    label: 'Captions',
    value: 'captions',
  },
];

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

  const handleTypeChange = (nextType: string) => {
    if (!(nextType in LIBRARY_ROUTE_BY_TYPE) || nextType === currentType) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams.toString());
    for (const key of TYPE_SPECIFIC_QUERY_KEYS) {
      nextSearchParams.delete(key);
    }

    const [nextPath, presetSearch = ''] =
      LIBRARY_ROUTE_BY_TYPE[
        nextType as keyof typeof LIBRARY_ROUTE_BY_TYPE
      ].split('?');
    nextSearchParams.delete('categories');
    new URLSearchParams(presetSearch).forEach((value, key) => {
      nextSearchParams.append(key, value);
    });
    const nextQuery = nextSearchParams.toString();

    replace(`${href(nextPath)}${nextQuery ? `?${nextQuery}` : ''}`, {
      scroll: false,
    });
  };

  return (
    <OptionSelect
      ariaLabel="Filter by asset type"
      onValueChange={handleTypeChange}
      options={LIBRARY_ASSET_TYPE_OPTIONS}
      value={currentType}
    />
  );
}
