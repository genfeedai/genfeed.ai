import TrainingImagesTab from '@pages/trainings/tabs/training-images-tab';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof TrainingImagesTab> = {
  argTypes: {},
  component: TrainingImagesTab,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Trainings/TrainingImagesTab',
};

export default meta;
type Story = StoryObj<typeof TrainingImagesTab>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
