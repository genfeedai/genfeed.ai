import AnalyticsTrends from '@pages/analytics/trends/analytics-trends';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof AnalyticsTrends> = {
  argTypes: {},
  component: AnalyticsTrends,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Pages/Analytics/AnalyticsTrends',
};

export default meta;
type Story = StoryObj<typeof AnalyticsTrends>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
