import type { Meta, StoryObj } from '@storybook/nextjs';
import AnalyticsTrends from './analytics-trends';

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
