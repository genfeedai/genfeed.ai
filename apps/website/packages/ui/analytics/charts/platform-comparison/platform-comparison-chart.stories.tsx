import type { Meta, StoryObj } from '@storybook/nextjs';
import { PlatformComparisonChart } from '@ui/analytics/charts/platform-comparison/platform-comparison-chart';

const meta: Meta<typeof PlatformComparisonChart> = {
  argTypes: {},
  component: PlatformComparisonChart,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Analytics/PlatformComparisonChart',
};

export default meta;
type Story = StoryObj<typeof PlatformComparisonChart>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
