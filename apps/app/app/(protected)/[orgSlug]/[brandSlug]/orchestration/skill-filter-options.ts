export const SOURCE_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Built-in', value: 'built_in' },
  { label: 'Imported', value: 'imported' },
  { label: 'Custom', value: 'custom' },
] as const;

export const MODALITY_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Text', value: 'text' },
  { label: 'Image', value: 'image' },
  { label: 'Video', value: 'video' },
  { label: 'Audio', value: 'audio' },
] as const;

export const STAGE_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Research', value: 'research' },
  { label: 'Planning', value: 'planning' },
  { label: 'Creation', value: 'creation' },
  { label: 'Review', value: 'review' },
  { label: 'Publishing', value: 'publishing' },
  { label: 'Analysis', value: 'analysis' },
] as const;

export type SourceFilterValue = (typeof SOURCE_FILTERS)[number]['value'];
export type ModalityFilterValue = (typeof MODALITY_FILTERS)[number]['value'];
export type StageFilterValue = (typeof STAGE_FILTERS)[number]['value'];
