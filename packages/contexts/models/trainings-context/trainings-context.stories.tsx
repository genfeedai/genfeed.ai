import TrainingsContext from '@genfeedai/contexts/models/trainings-context/trainings-context';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof TrainingsContext> = {
  component: TrainingsContext,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Contexts/Models/TrainingsContext',
};

export default meta;
type Story = StoryObj<typeof TrainingsContext>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
