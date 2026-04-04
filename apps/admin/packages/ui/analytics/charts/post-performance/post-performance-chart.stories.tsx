import type { Meta, StoryObj } from '@storybook/nextjs';
import { PostPerformanceChart } from '@ui/analytics/charts/post-performance/post-performance-chart';

const meta: Meta<typeof PostPerformanceChart> = {
  argTypes: {},
  component: PostPerformanceChart,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Analytics/PostPerformanceChart',
};

export default meta;
type Story = StoryObj<typeof PostPerformanceChart>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
