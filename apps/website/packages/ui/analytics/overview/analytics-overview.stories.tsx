import type { Meta, StoryObj } from '@storybook/nextjs';
import AnalyticsOverview from '@ui/analytics/overview/analytics-overview';

const meta: Meta<typeof AnalyticsOverview> = {
  argTypes: {},
  component: AnalyticsOverview,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Components/Components/Analytics/AnalyticsOverview',
};

export default meta;
type Story = StoryObj<typeof AnalyticsOverview>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
