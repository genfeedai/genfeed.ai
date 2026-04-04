import TrainingDetail from '@pages/trainings/detail/training-detail';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof TrainingDetail> = {
  argTypes: {},
  component: TrainingDetail,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Trainings/TrainingDetail',
};

export default meta;
type Story = StoryObj<typeof TrainingDetail>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
