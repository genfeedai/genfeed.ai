import type { Meta, StoryObj } from '@storybook/nextjs';
import PromptBarVariationPresets from '@ui/prompt-bars/components/variation-presets/PromptBarVariationPresets';

const meta: Meta<typeof PromptBarVariationPresets> = {
  argTypes: {
    onPresetSelect: { action: 'preset-selected' },
  },
  component: PromptBarVariationPresets,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  title: 'Components/PromptBars/VariationPresets',
};

export default meta;
type Story = StoryObj<typeof PromptBarVariationPresets>;

export const Default: Story = {
  args: {
    onPresetSelect: () => {},
    presets: [],
    selectedPreset: null,
  },
};

export const WithPresets: Story = {
  args: {
    onPresetSelect: () => {},
    presets: [
      { id: 'preset-1', name: 'Variation 1' },
      { id: 'preset-2', name: 'Variation 2' },
      { id: 'preset-3', name: 'Variation 3' },
    ],
    selectedPreset: 'preset-1',
  },
};
