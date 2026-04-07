import type { Meta, StoryObj } from '@storybook/nextjs';
import MasonryConfirmBridge from '@ui/masonry/shared/MasonryConfirmBridge';

const meta: Meta<typeof MasonryConfirmBridge> = {
  argTypes: {},
  component: MasonryConfirmBridge,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Masonry/MasonryConfirmBridge',
};

export default meta;
type Story = StoryObj<typeof MasonryConfirmBridge>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
