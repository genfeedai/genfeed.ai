import type { Meta, StoryObj } from '@storybook/nextjs';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';

const meta: Meta<typeof VideoPlayer> = {
  argTypes: {},
  component: VideoPlayer,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ui/VideoPlayer',
};

export default meta;
type Story = StoryObj<typeof VideoPlayer>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
