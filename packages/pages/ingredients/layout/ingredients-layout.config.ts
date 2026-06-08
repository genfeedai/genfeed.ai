import { IngredientFormat, IngredientStatus } from '@genfeedai/enums';
import type { IFieldOption } from '@genfeedai/interfaces';

export type IngredientsVisibleFilters = {
  search?: boolean;
  status?: boolean;
  format?: boolean;
  type?: boolean;
  provider?: boolean;
  sort?: boolean;
  account?: boolean;
};

export type IngredientsFilterOptions = {
  status?: readonly IFieldOption[];
  format?: readonly IFieldOption[];
  provider?: readonly IFieldOption[];
  sort?: readonly IFieldOption[];
  account?: readonly IFieldOption[];
};

export type IngredientsLayoutConfig = {
  visibleFilters: IngredientsVisibleFilters;
  filterOptions: IngredientsFilterOptions;
  showStudioLink: boolean;
  showUpload: boolean;
  showViewToggle: boolean;
};

// Filter configurations for different ingredient types
export const INGREDIENT_CONFIGS: Record<string, IngredientsLayoutConfig> = {
  avatars: {
    filterOptions: {
      provider: [
        { label: 'All Providers', value: '' },
        { label: 'HeyGen', value: 'heygen' },
      ],
      sort: [
        { label: 'Default', value: '' },
        { label: 'Newest First', value: 'createdAt: -1' },
        { label: 'Oldest First', value: 'createdAt: 1' },
      ],
      status: [
        { label: 'All Status', value: '' },
        { label: 'Completed', value: IngredientStatus.GENERATED },
        { label: 'Processing', value: IngredientStatus.PROCESSING },
      ],
    },
    showStudioLink: false,
    showUpload: false,
    showViewToggle: false,
    visibleFilters: {
      format: false,
      provider: true,
      search: true,
      sort: true,
      status: true,
      type: false,
    },
  },
  gifs: {
    filterOptions: {
      sort: [
        { label: 'Default', value: '' },
        { label: 'Newest First', value: 'createdAt: -1' },
        { label: 'Oldest First', value: 'createdAt: 1' },
      ],
      status: [
        { label: 'All Status', value: '' },
        { label: 'Archived', value: IngredientStatus.ARCHIVED },
        { label: 'Uploaded', value: IngredientStatus.UPLOADED },
        { label: 'Completed', value: IngredientStatus.GENERATED },
        { label: 'Processing', value: IngredientStatus.PROCESSING },
        { label: 'Validated', value: IngredientStatus.VALIDATED },
        { label: 'Failed', value: IngredientStatus.FAILED },
      ],
    },
    showStudioLink: false,
    showUpload: false,
    showViewToggle: false,
    visibleFilters: {
      format: false,
      provider: false,
      search: true,
      sort: true,
      status: true,
      type: false,
    },
  },
  images: {
    filterOptions: {
      format: [
        { label: 'All Formats', value: '' },
        { label: '16:9', value: IngredientFormat.LANDSCAPE },
        { label: '9:16', value: IngredientFormat.PORTRAIT },
        { label: '1:1', value: IngredientFormat.SQUARE },
      ],
      sort: [
        { label: 'Default', value: '' },
        { label: 'Newest First', value: 'createdAt: -1' },
        { label: 'Oldest First', value: 'createdAt: 1' },
      ],
      status: [
        { label: 'All Status', value: '' },
        { label: 'Archived', value: IngredientStatus.ARCHIVED },
        { label: 'Uploaded', value: IngredientStatus.UPLOADED },
        { label: 'Completed', value: IngredientStatus.GENERATED },
        { label: 'Processing', value: IngredientStatus.PROCESSING },
        { label: 'Validated', value: IngredientStatus.VALIDATED },
        { label: 'Failed', value: IngredientStatus.FAILED },
      ],
    },
    showStudioLink: true,
    showUpload: true,
    showViewToggle: false,
    visibleFilters: {
      format: true,
      provider: false,
      search: true,
      sort: true,
      status: true,
      type: false,
    },
  },
  musics: {
    filterOptions: {
      sort: [
        { label: 'Default', value: '' },
        { label: 'Newest First', value: 'createdAt: -1' },
        { label: 'Oldest First', value: 'createdAt: 1' },
        { label: 'Longest First', value: 'duration: -1' },
        { label: 'Shortest First', value: 'duration: 1' },
      ],
      status: [
        { label: 'All Status', value: '' },
        { label: 'Archived', value: IngredientStatus.ARCHIVED },
        { label: 'Uploaded', value: IngredientStatus.UPLOADED },
        { label: 'Completed', value: IngredientStatus.GENERATED },
        { label: 'Processing', value: IngredientStatus.PROCESSING },
        { label: 'Validated', value: IngredientStatus.VALIDATED },
        { label: 'Failed', value: IngredientStatus.FAILED },
      ],
    },
    showStudioLink: true,
    showUpload: false,
    showViewToggle: false,
    visibleFilters: {
      format: false,
      provider: false,
      search: true,
      sort: true,
      status: true,
      type: false,
    },
  },
  videos: {
    filterOptions: {
      format: [
        { label: 'All Formats', value: '' },
        { label: '16:9', value: IngredientFormat.LANDSCAPE },
        { label: '9:16', value: IngredientFormat.PORTRAIT },
        { label: '1:1', value: IngredientFormat.SQUARE },
      ],
      sort: [
        { label: 'Default', value: '' },
        { label: 'Newest First', value: 'createdAt: -1' },
        { label: 'Oldest First', value: 'createdAt: 1' },
        { label: 'Longest First', value: 'duration: -1' },
        { label: 'Shortest First', value: 'duration: 1' },
      ],
      status: [
        { label: 'All Status', value: '' },
        { label: 'Archived', value: IngredientStatus.ARCHIVED },
        { label: 'Uploaded', value: IngredientStatus.UPLOADED },
        { label: 'Completed', value: IngredientStatus.GENERATED },
        { label: 'Processing', value: IngredientStatus.PROCESSING },
        { label: 'Validated', value: IngredientStatus.VALIDATED },
        { label: 'Failed', value: IngredientStatus.FAILED },
      ],
    },
    showStudioLink: true,
    showUpload: true,
    showViewToggle: false,
    visibleFilters: {
      format: true,
      provider: false,
      search: true,
      sort: true,
      status: true,
      type: false,
    },
  },
  voices: {
    filterOptions: {
      provider: [
        { label: 'All Providers', value: '' },
        { label: 'HeyGen', value: 'heygen' },
        { label: 'ElevenLabs', value: 'elevenlabs' },
        { label: 'Genfeed', value: 'genfeed-ai' },
      ],
      sort: [
        { label: 'Default', value: '' },
        { label: 'Newest First', value: 'createdAt: -1' },
        { label: 'Oldest First', value: 'createdAt: 1' },
      ],
      status: [
        { label: 'All Status', value: '' },
        { label: 'Completed', value: IngredientStatus.GENERATED },
        { label: 'Processing', value: IngredientStatus.PROCESSING },

        { label: 'Archived', value: IngredientStatus.ARCHIVED },
        { label: 'Uploaded', value: IngredientStatus.UPLOADED },
        { label: 'Completed', value: IngredientStatus.GENERATED },
        { label: 'Processing', value: IngredientStatus.PROCESSING },
        { label: 'Validated', value: IngredientStatus.VALIDATED },
        { label: 'Failed', value: IngredientStatus.FAILED },
      ],
    },
    showStudioLink: false,
    showUpload: true,
    showViewToggle: false,
    visibleFilters: {
      format: false,
      provider: true,
      search: true,
      sort: true,
      status: true,
      type: false,
    },
  },
};

export const INGREDIENT_LABELS: Record<
  string,
  { label: string; description: string }
> = {
  avatars: {
    description: 'Create and manage AI avatars for video presentations',
    label: 'Avatars',
  },
  gifs: {
    description: 'Browse and manage your animated GIF assets',
    label: 'GIFs',
  },
  images: {
    description: 'Organize and enhance your image assets for content creation',
    label: 'Images',
  },
  musics: {
    description: 'Browse and manage your audio tracks and background music',
    label: 'Music',
  },
  videos: {
    description: 'Manage your video library and create stunning visual content',
    label: 'Videos',
  },
  voices: {
    description: 'Access AI-generated voices and manage voice clones',
    label: 'Voices',
  },
};
