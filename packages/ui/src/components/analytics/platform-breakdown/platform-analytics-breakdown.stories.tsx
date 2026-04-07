import type { Meta, StoryObj } from '@storybook/nextjs';
import PlatformAnalyticsBreakdown from '@ui/analytics/platform-breakdown/platform-analytics-breakdown';

const meta: Meta<typeof PlatformAnalyticsBreakdown> = {
  argTypes: {},
  component: PlatformAnalyticsBreakdown,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Analytics/PlatformAnalyticsBreakdown',
};

export default meta;
type Story = StoryObj<typeof PlatformAnalyticsBreakdown>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
