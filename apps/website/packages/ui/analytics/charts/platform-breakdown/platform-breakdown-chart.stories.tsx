import type { Meta, StoryObj } from '@storybook/nextjs';
import { PlatformBreakdownChart } from '@ui/analytics/charts/platform-breakdown/platform-breakdown-chart';

const meta: Meta<typeof PlatformBreakdownChart> = {
  argTypes: {},
  component: PlatformBreakdownChart,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Analytics/PlatformBreakdownChart',
};

export default meta;
type Story = StoryObj<typeof PlatformBreakdownChart>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
