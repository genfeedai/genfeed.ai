import TrainingsList from '@pages/trainings/list/trainings-list';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof TrainingsList> = {
  argTypes: {},
  component: TrainingsList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Trainings/TrainingsList',
};

export default meta;
type Story = StoryObj<typeof TrainingsList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
