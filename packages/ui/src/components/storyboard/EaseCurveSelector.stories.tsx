import type { Meta, StoryObj } from '@storybook/nextjs';
import EaseCurveSelector from '@ui/storyboard/EaseCurveSelector';

const meta: Meta<typeof EaseCurveSelector> = {
  component: EaseCurveSelector,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Storyboard/EaseCurveSelector',
};

export default meta;
type Story = StoryObj<typeof EaseCurveSelector>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
