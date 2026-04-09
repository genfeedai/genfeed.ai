import type { Meta, StoryObj } from '@storybook/nextjs';
import ScenesList from './scenes-list';

const meta: Meta<typeof ScenesList> = {
  argTypes: {},
  component: ScenesList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/Elements/ScenesList',
};

export default meta;
type Story = StoryObj<typeof ScenesList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
