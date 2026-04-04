import type { Meta, StoryObj } from '@storybook/nextjs';
import PromptBarFrameControls from '@ui/prompt-bars/components/frame-controls/PromptBarFrameControls';

const meta: Meta<typeof PromptBarFrameControls> = {
  argTypes: {
    currentFrame: { control: 'number' },
    onFrameChange: { action: 'frame-changed' },
    onFrameSelect: { action: 'frame-selected' },
    totalFrames: { control: 'number' },
  },
  component: PromptBarFrameControls,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  title: 'Components/PromptBars/FrameControls',
};

export default meta;
type Story = StoryObj<typeof PromptBarFrameControls>;

export const Default: Story = {
  args: {
    currentFrame: 1,
    onFrameChange: () => {},
    onFrameSelect: () => {},
    totalFrames: 10,
  },
};

export const MiddleFrame: Story = {
  args: {
    currentFrame: 5,
    onFrameChange: () => {},
    onFrameSelect: () => {},
    totalFrames: 10,
  },
};

export const LastFrame: Story = {
  args: {
    currentFrame: 10,
    onFrameChange: () => {},
    onFrameSelect: () => {},
    totalFrames: 10,
  },
};
