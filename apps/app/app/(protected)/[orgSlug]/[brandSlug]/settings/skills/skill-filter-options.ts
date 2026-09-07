import type {
  ModalityFilterValue,
  SourceFilterValue,
  StageFilterValue,
} from '@props/settings/skill-filters.props';

export const SOURCE_FILTERS = [
  { labelKey: 'all', value: 'all' },
  { labelKey: 'builtIn', value: 'built_in' },
  { labelKey: 'imported', value: 'imported' },
  { labelKey: 'custom', value: 'custom' },
  { labelKey: 'customized', value: 'customized' },
] as const satisfies readonly { labelKey: string; value: SourceFilterValue }[];

export const MODALITY_FILTERS = [
  { labelKey: 'all', value: 'all' },
  { labelKey: 'text', value: 'text' },
  { labelKey: 'image', value: 'image' },
  { labelKey: 'video', value: 'video' },
  { labelKey: 'audio', value: 'audio' },
] as const satisfies readonly {
  labelKey: string;
  value: ModalityFilterValue;
}[];

export const STAGE_FILTERS = [
  { labelKey: 'all', value: 'all' },
  { labelKey: 'research', value: 'research' },
  { labelKey: 'planning', value: 'planning' },
  { labelKey: 'creation', value: 'creation' },
  { labelKey: 'review', value: 'review' },
  { labelKey: 'publishing', value: 'publishing' },
  { labelKey: 'analysis', value: 'analysis' },
] as const satisfies readonly { labelKey: string; value: StageFilterValue }[];

export type {
  ModalityFilterValue,
  SourceFilterValue,
  StageFilterValue,
} from '@props/settings/skill-filters.props';
