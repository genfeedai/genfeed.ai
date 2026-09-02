export interface IVariationPreset {
  key: string;
  label: string;
  prompt: string;
}

export const VARIATION_PROMPT_PRESETS: IVariationPreset[] = [
  {
    key: 'similar',
    label: 'Similar',
    prompt: 'Generate a similar image with the same style and composition',
  },
  {
    key: 'color',
    label: 'New Colors',
    prompt: 'Same composition and style but with a different color palette',
  },
  {
    key: 'style',
    label: 'Style Transfer',
    prompt: 'Apply the artistic style of this reference to a new composition',
  },
];
