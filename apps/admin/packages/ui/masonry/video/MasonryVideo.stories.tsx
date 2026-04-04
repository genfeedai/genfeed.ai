import type { Meta, StoryObj } from '@storybook/nextjs';
import MasonryVideo from '@ui/masonry/video/MasonryVideo';

const meta: Meta<typeof MasonryVideo> = {
  argTypes: {},
  component: MasonryVideo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Masonry/MasonryVideo',
};

export default meta;
type Story = StoryObj<typeof MasonryVideo>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
