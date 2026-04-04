import type { Meta, StoryObj } from '@storybook/nextjs';
import EaseCurveSelector from '@ui/storyboard/EaseCurveSelector';

const meta: Meta<typeof EaseCurveSelector> = {
  argTypes: {
    // TODO: Add argTypes for component props
  },
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
  args: {
    // TODO: Add default props
  },
};

export const Interactive: Story = {
  args: {
    // TODO: Add interactive props
  },
};
