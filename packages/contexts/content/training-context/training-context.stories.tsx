import TrainingContext from '@contexts/content/training-context/training-context';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof TrainingContext> = {
  argTypes: {},
  component: TrainingContext,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Contexts/Content/TrainingContext',
};

export default meta;
type Story = StoryObj<typeof TrainingContext>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
