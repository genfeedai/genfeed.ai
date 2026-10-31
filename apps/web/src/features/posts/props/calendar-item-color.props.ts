export type CalendarTagColorSource = {
  backgroundColor?: string | null;
  isDeleted?: boolean;
};

export type ContentCalendarColorItem = {
  article?: { tags?: readonly CalendarTagColorSource[] | null };
  itemType: 'article' | 'release' | 'slot';
  release?: { firstTagColor?: string | null };
  status: string;
};
