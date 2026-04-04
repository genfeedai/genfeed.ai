import type { Meta, StoryObj } from '@storybook/nextjs';
import { TimeSeriesChart } from '@ui/analytics/charts/time-series/time-series-chart';

const meta: Meta<typeof TimeSeriesChart> = {
  argTypes: {},
  component: TimeSeriesChart,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Analytics/TimeSeriesChart',
};

export default meta;
type Story = StoryObj<typeof TimeSeriesChart>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
