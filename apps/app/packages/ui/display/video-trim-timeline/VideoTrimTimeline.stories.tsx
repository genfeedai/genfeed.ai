import type { Meta, StoryObj } from '@storybook/nextjs';
import VideoTrimTimeline from '@ui/display/video-trim-timeline/VideoTrimTimeline';

const meta: Meta<typeof VideoTrimTimeline> = {
  argTypes: {},
  component: VideoTrimTimeline,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ui/VideoTrimTimeline',
};

export default meta;
type Story = StoryObj<typeof VideoTrimTimeline>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
