import type { Meta, StoryObj } from '@storybook/nextjs';
import MasonryImage from '@ui/masonry/image/MasonryImage';

const meta: Meta<typeof MasonryImage> = {
  argTypes: {},
  component: MasonryImage,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Masonry/MasonryImage',
};

export default meta;
type Story = StoryObj<typeof MasonryImage>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
