export const SOURCE_FILTERS = [
  { labelKey: 'all', value: 'all' },
  { labelKey: 'builtIn', value: 'built_in' },
  { labelKey: 'imported', value: 'imported' },
  { labelKey: 'custom', value: 'custom' },
] as const;

export const MODALITY_FILTERS = [
  { labelKey: 'all', value: 'all' },
  { labelKey: 'text', value: 'text' },
  { labelKey: 'image', value: 'image' },
  { labelKey: 'video', value: 'video' },
  { labelKey: 'audio', value: 'audio' },
] as const;

export const STAGE_FILTERS = [
  { labelKey: 'all', value: 'all' },
  { labelKey: 'research', value: 'research' },
  { labelKey: 'planning', value: 'planning' },
  { labelKey: 'creation', value: 'creation' },
  { labelKey: 'review', value: 'review' },
  { labelKey: 'publishing', value: 'publishing' },
  { labelKey: 'analysis', value: 'analysis' },
] as const;

export type SourceFilterValue = (typeof SOURCE_FILTERS)[number]['value'];
export type ModalityFilterValue = (typeof MODALITY_FILTERS)[number]['value'];
export type StageFilterValue = (typeof STAGE_FILTERS)[number]['value'];
