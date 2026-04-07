import type { Meta, StoryObj } from '@storybook/nextjs';
import { PlatformTimeSeriesChart } from '@ui/analytics/charts/platform-time-series/platform-time-series-chart';

const meta: Meta<typeof PlatformTimeSeriesChart> = {
  argTypes: {},
  component: PlatformTimeSeriesChart,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Analytics/PlatformTimeSeriesChart',
};

export default meta;
type Story = StoryObj<typeof PlatformTimeSeriesChart>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
