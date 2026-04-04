import AnalyticsOrganizationOverview from '@pages/analytics/organization-overview/analytics-organization-overview';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof AnalyticsOrganizationOverview> = {
  argTypes: {},
  component: AnalyticsOrganizationOverview,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Pages/Analytics/AnalyticsOrganizationOverview',
};

export default meta;
type Story = StoryObj<typeof AnalyticsOrganizationOverview>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
