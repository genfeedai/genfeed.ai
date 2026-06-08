import { IngredientFormat, IngredientStatus } from '@genfeedai/enums';
import {
  MdOutlineCropLandscape,
  MdOutlineCropPortrait,
  MdOutlineCropSquare,
} from 'react-icons/md';

export const DEFAULT_STATUS_OPTIONS = [
  { label: 'Uploaded', value: IngredientStatus.UPLOADED },
  { label: 'Completed', value: IngredientStatus.GENERATED },
  { label: 'Validated', value: IngredientStatus.VALIDATED },
  { label: 'Archived', value: IngredientStatus.ARCHIVED },
  { label: 'Draft', value: IngredientStatus.DRAFT },
  { label: 'Processing', value: IngredientStatus.PROCESSING },
  { label: 'Failed', value: IngredientStatus.FAILED },
];

export const DEFAULT_FORMAT_OPTIONS = [
  { label: 'All', value: '' },
  {
    icon: <MdOutlineCropSquare size={16} />,
    label: '1:1',
    value: IngredientFormat.SQUARE,
  },
  {
    icon: <MdOutlineCropLandscape size={16} />,
    label: '16:9',
    value: IngredientFormat.LANDSCAPE,
  },
  {
    icon: <MdOutlineCropPortrait size={16} />,
    label: '9:16',
    value: IngredientFormat.PORTRAIT,
  },
];

export const DEFAULT_TYPE_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Video', value: 'video' },
  { label: 'Image', value: 'image' },
  { label: 'Audio', value: 'audio' },
  { label: 'Clip', value: 'clip' },
  { label: 'Avatar', value: 'avatar' },
  { label: 'Voice', value: 'voice' },
  { label: 'Music', value: 'music' },
  { label: 'GIF', value: 'gif' },
  { label: 'Image to Video', value: 'image-to-video' },
];

export const DEFAULT_SORT_OPTIONS = [
  { label: 'Latest (Default)', value: '' },
  { label: 'Newest First', value: 'createdAt: -1' },
  { label: 'Oldest First', value: 'createdAt: 1' },
  { label: 'Name (A-Z)', value: 'label: 1' },
  { label: 'Name (Z-A)', value: 'label: -1' },
  { label: 'Recently Updated', value: 'updatedAt: -1' },
];

export const DEFAULT_FAVORITE_OPTIONS = [
  { label: 'All Items', value: '' },
  { label: 'Favorites Only', value: 'true' },
  { label: 'Non-Favorites', value: 'false' },
];

export const DEFAULT_PROVIDER_OPTIONS = [
  { label: 'All Providers', value: '' },
  { label: 'Runway', value: 'runway' },
  { label: 'Leonardo', value: 'leonardo' },
  { label: 'ElevenLabs', value: 'elevenlabs' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'Anthropic', value: 'anthropic' },
  { label: 'Google', value: 'google' },
  { label: 'Stability AI', value: 'stability' },
  { label: 'Midjourney', value: 'midjourney' },
  { label: 'Replicate', value: 'replicate' },
];

export const DEFAULT_MODEL_OPTIONS = [{ label: 'All Models', value: '' }];

export const DEFAULT_ACCOUNT_OPTIONS = [{ label: 'All Brands', value: '' }];

export const DEFAULT_FILTER_OPTIONS = {};

export const DEFAULT_VISIBLE_FILTERS = {
  favorite: false,
  format: true,
  model: false,
  provider: true,
  search: true,
  sort: true,
  status: true,
  type: true,
};
