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
    href: '/library/videos',
    label: 'Videos',
    matchPaths: ['/library/videos'],
    outline: HiOutlineVideoCamera,
    solid: HiVideoCamera,
  },
  {
    group: '',
    href: '/library/images',
    label: 'Images',
    matchPaths: ['/library/images'],
    outline: HiOutlinePhoto,
    solid: HiPhoto,
  },
  {
    group: '',
    href: '/library/gifs',
    label: 'GIFs',
    matchPaths: ['/library/gifs'],
    outline: HiOutlinePlayCircle,
    solid: HiPlayCircle,
  },
  {
    group: '',
    href: '/library/avatars',
    label: 'Avatars',
    matchPaths: ['/library/avatars'],
    outline: HiOutlineSparkles,
    solid: HiSparkles,
  },
  {
    group: '',
    hasDividerAbove: true,
    href: '/library/voices',
    label: 'Voices',
    matchPaths: ['/library/voices'],
    outline: HiOutlineMicrophone,
    solid: HiMicrophone,
  },
  {
    group: '',
    href: '/library/music',
    label: 'Music',
    matchPaths: ['/library/music'],
    outline: HiOutlineMusicalNote,
    solid: HiMusicalNote,
  },
  {
    group: '',
    href: '/library/captions',
    label: 'Captions',
    matchPaths: ['/library/captions'],
    outline: HiOutlineDocumentText,
    solid: HiDocumentText,
  },
];

export const LIBRARY_LOGO_HREF = '/library/ingredients';
