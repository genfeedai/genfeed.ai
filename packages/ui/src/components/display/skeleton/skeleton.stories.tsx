import type { Meta, StoryObj } from '@storybook/nextjs';
import { Skeleton } from '@ui/display/skeleton/skeleton';

const meta: Meta<typeof Skeleton> = {
  argTypes: {},
  component: Skeleton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ui/Skeleton',
};

export default meta;
type Story = StoryObj<typeof Skeleton>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
