import { CardEmptySize, IngredientStatus } from '@genfeedai/enums';

/**
 * Gallery grid layout class - responsive columns
 */
export const GALLERY_GRID_CLASS =
  'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6';

/**
 * Gallery container padding - responsive
 */
export const GALLERY_CONTAINER_PADDING = 'p-3 sm:p-4 md:p-6';

/**
 * Gallery empty state size
 */
export const GALLERY_EMPTY_SIZE = CardEmptySize.LG;

/**
 * Default sort order for gallery items
 */
export const GALLERY_DEFAULT_SORT = 'createdAt: -1';

/**
 * Default statuses to show in gallery
 */
export const GALLERY_DEFAULT_STATUSES = [
  IngredientStatus.GENERATED,
  IngredientStatus.VALIDATED,
];

/**
 * Gallery sidebar menu configuration
 */
export const GALLERY_MENU_ITEMS = [
  { href: '/gallery/videos', iconName: 'HiVideoCamera', label: 'Videos' },
  { href: '/gallery/images', iconName: 'HiPhoto', label: 'Images' },
  { href: '/gallery/musics', iconName: 'HiMusicalNote', label: 'Music' },
  { href: '/gallery/posts', iconName: 'HiDocumentText', label: 'Posts' },
  { href: '/gallery/leaderboard', iconName: 'HiTrophy', label: 'Leaderboard' },
  { href: '/prompts', iconName: 'HiLightBulb', label: 'Prompts' },
] as const;

/**
 * Empty state messages for each gallery type
 */
export const GALLERY_EMPTY_MESSAGES = {
  images: {
    description:
      'Be the first to share AI-generated artwork with the community.',
    label: 'No Images Yet',
  },
  leaderboard: {
    description: 'Be the first to join the leaderboard.',
    label: 'No Leaderboard Data',
  },
  musics: {
    description:
      'Be the first to share AI-composed music tracks with the community.',
    label: 'No Music Yet',
  },
  posts: {
    description: 'Be the first to share AI-generated posts with the community.',
    label: 'No Posts Yet',
  },
  prompts: {
    description: 'Be the first to share prompts with the community.',
    label: 'No Prompts Yet',
  },
  videos: {
    description:
      'Be the first to share AI-generated videos with the community.',
    label: 'No Videos Yet',
  },
} as const;

export type GalleryType = keyof typeof GALLERY_EMPTY_MESSAGES;
