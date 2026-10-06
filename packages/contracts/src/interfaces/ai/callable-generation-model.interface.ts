/**
 * Generation types an account can be offered through `get_generation_options`.
 * Values match `ModelCategory` for those rows.
 */
export const CALLABLE_GENERATION_MODEL_TYPES = [
  'image',
  'image-edit',
  'video',
  'voice',
  'music',
] as const;

export type CallableGenerationModelType =
  (typeof CALLABLE_GENERATION_MODEL_TYPES)[number];

/**
 * One catalog row this account can pass to generation.
 * `key` is the exact `generate.model` or `transform_media.model` value.
 */
export interface CallableGenerationModel {
  key: string;
  label: string;
  type: CallableGenerationModelType;
}
