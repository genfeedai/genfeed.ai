import AnalyticsOrganizationsList from '@pages/analytics/organizations-list/analytics-organizations-list';
import type { Meta, StoryObj } from '@storybook/nextjs';

const meta: Meta<typeof AnalyticsOrganizationsList> = {
  argTypes: {},
  component: AnalyticsOrganizationsList,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  title: 'Pages/Analytics/AnalyticsOrganizationsList',
};

export default meta;
type Story = StoryObj<typeof AnalyticsOrganizationsList>;

export const Default: Story = {
  args: {},
};

export const Interactive: Story = {
  args: {},
};
