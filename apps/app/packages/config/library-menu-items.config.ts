import { APP_ROUTES } from '@genfeedai/constants';
import type { MenuItemConfig } from '@genfeedai/interfaces/ui/menu-config.interface';
import {
  HiDocumentText,
  HiMicrophone,
  HiMusicalNote,
  HiOutlineDocumentText,
  HiOutlineMicrophone,
  HiOutlineMusicalNote,
  HiOutlinePhoto,
  HiOutlinePlayCircle,
  HiOutlineSparkles,
  HiOutlineVideoCamera,
  HiPhoto,
  HiPlayCircle,
  HiSparkles,
  HiVideoCamera,
} from 'react-icons/hi2';

export const LIBRARY_MENU_ITEMS: MenuItemConfig[] = [
  {
    group: '',
    href: APP_ROUTES.LIBRARY.VIDEOS,
    label: 'Videos',
    matchPaths: [APP_ROUTES.LIBRARY.VIDEOS],
    outline: HiOutlineVideoCamera,
    solid: HiVideoCamera,
  },
  {
    group: '',
    href: APP_ROUTES.LIBRARY.IMAGES,
    label: 'Images',
    matchPaths: [APP_ROUTES.LIBRARY.IMAGES],
    outline: HiOutlinePhoto,
    solid: HiPhoto,
  },
  {
    group: '',
    href: APP_ROUTES.LIBRARY.GIFS,
    label: 'GIFs',
    matchPaths: [APP_ROUTES.LIBRARY.GIFS],
    outline: HiOutlinePlayCircle,
    solid: HiPlayCircle,
  },
  {
    group: '',
    href: APP_ROUTES.LIBRARY.AVATARS,
    label: 'Avatars',
    matchPaths: [APP_ROUTES.LIBRARY.AVATARS],
    outline: HiOutlineSparkles,
    solid: HiSparkles,
  },
  {
    group: '',
    hasDividerAbove: true,
    href: APP_ROUTES.LIBRARY.VOICES,
    label: 'Voices',
    matchPaths: [APP_ROUTES.LIBRARY.VOICES],
    outline: HiOutlineMicrophone,
    solid: HiMicrophone,
  },
  {
    group: '',
    href: APP_ROUTES.LIBRARY.MUSIC,
    label: 'Music',
    matchPaths: [APP_ROUTES.LIBRARY.MUSIC],
    outline: HiOutlineMusicalNote,
    solid: HiMusicalNote,
  },
  {
    group: '',
    href: APP_ROUTES.LIBRARY.CAPTIONS,
    label: 'Captions',
    matchPaths: [APP_ROUTES.LIBRARY.CAPTIONS],
    outline: HiOutlineDocumentText,
    solid: HiDocumentText,
  },
];

export const LIBRARY_LOGO_HREF = APP_ROUTES.LIBRARY.INGREDIENTS;
