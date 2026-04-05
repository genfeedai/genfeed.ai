import type { Meta, StoryObj } from '@storybook/nextjs';
import LazyLoad from '@ui/lazy/load/LazyLoad';

const meta: Meta<typeof LazyLoad> = {
  argTypes: {},
  component: LazyLoad,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Lazy/LazyLoad',
};

export default meta;
type Story = StoryObj<typeof LazyLoad>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
