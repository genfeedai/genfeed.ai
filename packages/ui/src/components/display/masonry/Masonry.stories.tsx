import type { Meta, StoryObj } from '@storybook/nextjs';
import Masonry from '@ui/display/masonry/Masonry';

const meta: Meta<typeof Masonry> = {
  argTypes: {},
  component: Masonry,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ui/Masonry',
};

export default meta;
type Story = StoryObj<typeof Masonry>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
