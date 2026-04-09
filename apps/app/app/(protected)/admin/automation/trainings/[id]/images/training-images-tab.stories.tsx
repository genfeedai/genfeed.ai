import type { Meta, StoryObj } from '@storybook/nextjs';
import TrainingImagesTab from './training-images-tab';

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
