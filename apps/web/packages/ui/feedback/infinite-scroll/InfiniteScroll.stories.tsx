import type { Meta, StoryObj } from '@storybook/nextjs';
import InfiniteScroll from '@ui/feedback/infinite-scroll/InfiniteScroll';

const meta: Meta<typeof InfiniteScroll> = {
  argTypes: {},
  component: InfiniteScroll,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Ui/InfiniteScroll',
};

export default meta;
type Story = StoryObj<typeof InfiniteScroll>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
