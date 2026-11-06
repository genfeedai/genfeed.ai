import { TagCategory } from '@genfeedai/contracts';

export const TAG_SCOPE_COLORS: Record<
  string,
  { bg: string; text: string; icon: string }
> = {
  [TagCategory.INGREDIENT]: {
    bg: 'bg-categorical-blue/10',
    icon: '',
    text: 'text-categorical-blue',
  },
  [TagCategory.ARTICLE]: {
    bg: 'bg-categorical-amber/10',
    icon: '',
    text: 'text-categorical-amber',
  },
  [TagCategory.PROMPT]: {
    bg: 'bg-categorical-violet/10',
    icon: '',
    text: 'text-categorical-violet',
  },
  universal: {
    bg: 'bg-foreground/10',
    icon: '',
    text: 'text-muted-foreground',
  },
};

/** Category choices for a tag; the empty value means "None". */
export const TAG_CATEGORY_OPTIONS = [
  { label: 'None', value: '' },
  { label: 'Credential', value: TagCategory.CREDENTIAL },
  { label: 'Ingredient', value: TagCategory.INGREDIENT },
  { label: 'Prompt', value: TagCategory.PROMPT },
  { label: 'Article', value: TagCategory.ARTICLE },
  { label: 'Organization', value: TagCategory.ORGANIZATION },
];
