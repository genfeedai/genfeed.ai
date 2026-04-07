import type { Meta, StoryObj } from '@storybook/nextjs';
import MasonryGrid from '@ui/masonry/grid/MasonryGrid';

const meta: Meta<typeof MasonryGrid> = {
  argTypes: {},
  component: MasonryGrid,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Masonry/MasonryGrid',
};

export default meta;
type Story = StoryObj<typeof MasonryGrid>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
