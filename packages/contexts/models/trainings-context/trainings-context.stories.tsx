import TrainingsContext from '@contexts/models/trainings-context/trainings-context';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof TrainingsContext> = {
  argTypes: {
    // TODO: Add argTypes for component props
  },
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
  args: {
    // TODO: Add default props
  },
};

export const Interactive: Story = {
  args: {
    // TODO: Add interactive props
  },
};
