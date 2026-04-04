import type { Meta, StoryObj } from '@storybook/nextjs';
import MasonryBadgeOverlay from '@ui/masonry/shared/MasonryBadgeOverlay';

const meta: Meta<typeof MasonryBadgeOverlay> = {
  argTypes: {},
  component: MasonryBadgeOverlay,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Masonry/MasonryBadgeOverlay',
};

export default meta;
type Story = StoryObj<typeof MasonryBadgeOverlay>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
