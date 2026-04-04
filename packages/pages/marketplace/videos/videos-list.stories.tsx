import VideosList from '@pages/marketplace/videos/videos-list';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof VideosList> = {
  argTypes: {},
  component: VideosList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Pages/VideosList',
};

export default meta;
type Story = StoryObj<typeof VideosList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
