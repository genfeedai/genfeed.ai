import type { Meta, StoryObj } from '@storybook/nextjs';
import TrainingSourcesTab from './training-sources-tab';

const meta: Meta<typeof TrainingSourcesTab> = {
  argTypes: {},
  component: TrainingSourcesTab,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Trainings/TrainingSourcesTab',
};

export default meta;
type Story = StoryObj<typeof TrainingSourcesTab>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
