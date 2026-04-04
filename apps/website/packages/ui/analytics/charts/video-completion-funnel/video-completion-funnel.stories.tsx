import type { Meta, StoryObj } from '@storybook/nextjs';
import { VideoCompletionFunnel } from '@ui/analytics/charts/video-completion-funnel/video-completion-funnel';

const meta: Meta<typeof VideoCompletionFunnel> = {
  argTypes: {},
  component: VideoCompletionFunnel,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Analytics/VideoCompletionFunnel',
};

export default meta;
type Story = StoryObj<typeof VideoCompletionFunnel>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
