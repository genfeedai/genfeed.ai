import { TagCategory } from '@genfeedai/enums';

export const TAG_SCOPE_COLORS: Record<
  string,
  { bg: string; text: string; icon: string }
> = {
  [TagCategory.INGREDIENT]: {
    bg: 'bg-blue-500/10',
    icon: '',
    text: 'text-blue-500',
  },
  [TagCategory.ARTICLE]: {
    bg: 'bg-yellow-500/10',
    icon: '',
    text: 'text-yellow-500',
  },
  [TagCategory.PROMPT]: {
    bg: 'bg-purple-500/10',
    icon: '',
    text: 'text-purple-500',
  },
  universal: {
    bg: 'bg-gray-500/10',
    icon: '',
    text: 'text-gray-500',
  },
};
