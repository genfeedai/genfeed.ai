import type { Meta, StoryObj } from '@storybook/nextjs';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';

const meta: Meta<typeof LazyLoadingFallback> = {
  argTypes: {},
  component: LazyLoadingFallback,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Loading/LazyLoadingFallback',
};

export default meta;
type Story = StoryObj<typeof LazyLoadingFallback>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
