import AnalyticsOverview from '@pages/analytics/overview/analytics-overview';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof AnalyticsOverview> = {
  argTypes: {},
  component: AnalyticsOverview,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Pages/Analytics/AnalyticsOverview',
};

export default meta;
type Story = StoryObj<typeof AnalyticsOverview>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
