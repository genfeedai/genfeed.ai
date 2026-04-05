import type { Meta, StoryObj } from '@storybook/nextjs';
import { BrandPerformanceChart } from '@ui/analytics/charts/brand-performance/brand-performance-chart';

const meta: Meta<typeof BrandPerformanceChart> = {
  argTypes: {},
  component: BrandPerformanceChart,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Analytics/BrandPerformanceChart',
};

export default meta;
type Story = StoryObj<typeof BrandPerformanceChart>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
